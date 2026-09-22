# GAIA — Plan de Testing y Métricas de Rendimiento

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.1  
> **Fecha:** 2026-09-22  

---

## 1. Propósito

Definir cómo se verifican los requisitos funcionales (RF) y no funcionales (RNF) de GAIA, qué herramientas se usan, qué umbrales de aceptación aplican y qué tests automatizados se implementan.

La estrategia sigue una **pirámide de testing**:

```
             ┌───────────┐
             │  E2E /    │   Playwright, BrowserStack
             │  perf     │   (pocos, lentos, críticos)
             └─────┬─────┘
             ┌─────┴─────┐
             │Integración│   pytest (backend), msw (frontend)
             └─────┬─────┘
        ┌──────────┴──────────┐
        │     Unitarios       │   Vitest + pytest — mayoría
        └─────────────────────┘
```

Objetivo de cobertura: **≥ 80 %** en `frontend/src/utils/` y `store/actions.ts`; **≥ 90 %** en `radiation_normalizer.py` y `coordinates.ts` (lógica pura de dominio).

---

## 2. Métricas de Rendimiento GPU (RNF-01, RNF-02)

### 2.1 Herramientas de Medición

| Herramienta | Dónde se integra | Qué mide |
| ----------- | ---------------- | -------- |
| `stats.js`  | `core/Stats.ts` (overlay debug) | FPS en vivo, frame time |
| `renderer.info` | `core/Stats.ts` (mismo loop) | `render.calls` (draw calls), `render.triangles`, `memory.geometries`, `memory.textures` |
| Chrome DevTools → Performance | Instrumentación manual | Timeline de frames, main thread jank, voids |
| Chrome DevTools → Rendering | Throttling de CPU 6× | Degradación bajo CPU limits |
| WebGL Inspector / Spector.js | Opcional (debug avanzado) | Draw calls por pase, estados GL |

### 2.2 Umbrales de Aceptación

| Métrica              | Objetivo              | Presupuesto de frame |
| -------------------- | --------------------- | -------------------- |
| **FPS**              | ≥ 60 estables         | ≤ 16.67 ms / frame   |
| **Datos simultáneos**| > 20,000 combinados   | con todas las capas  |
| **Draw calls**       | ≤ 8 por frame (RNF-02)| 1–2 por módulo       |
| **Frame time (p95)** | ≤ 18 ms               | sin caídas sostenidas |

Presupuesto de draw calls derivado de la [Estructura del Proyecto](./GAIA_PROJECT_STRUCTURE.md):

| Módulo    | Geometría GPU         | Draw calls |
| --------- | --------------------- | :--------: |
| globo     | Sphere + Atmosphere   | 2 |
| fire      | InstancedMesh         | 1 |
| wind      | Points + TF feedback  | 1 |
| seismic   | InstancedMesh + anillo| 1–2 |
| flood     | WaterMesh             | 1 |
| radiation | InstancedMesh/heatmap | 1 |
| **Total** |                       | **7–8** |

### 2.3 Procedimiento de Prueba

1. Cargar la app y esperar a que terminen la ingesta y la inicialización de workers (badge `LIVE` en todos los módulos).
2. Activar **todas** las capas (Fuego, Viento, Sismos, Inundación, Radiación).
3. Registrar con `stats.js`: medir **60 segundos sostenidos** con un script automatizado:

   ```typescript
   // frontend/tests/perf/fps.spec.ts (Vitest + puppeteer, o manual)
   const sampler = await connectStatsOverlay();
   sampler.start({ durationMs: 60_000 });

   const { avgFps, p95FrameMs, minDrawCalls, maxDrawCalls } = sampler.results();
   expect(avgFps).toBeGreaterThanOrEqual(60);
   expect(p95FrameMs).toBeLessThanOrEqual(18);
   expect(maxDrawCalls).toBeLessThanOrEqual(8);
   ```

4. Registrar `renderer.info.render.calls` en cada frame y verificar **`max(drawCalls) ≤ 8`** durante la ventana completa.

### 2.4 Escenarios de Estrés

| Escenario                    | Carga                      | Resultado esperado                 |
| ---------------------------- | -------------------------- | ---------------------------------- |
| Baseline                     | Globo solo (sin capas)     | 60+ FPS, 2 draw calls              |
| Nominal (aceptación)         | 20,000 datos, todas capas  | ≥ 60 FPS, ≤ 8 draw calls           |
| **Estrés (degradación)**     | 50,000 datos combinados    | Se documenta la degradación (FPS/ms) |
| Cambio de filtro repetido    | 24h → 7d → 30d → 24h × 50  | Reacomodación < 200 ms sin jank     |

> [!NOTE]
> En el escenario de estrés no se exige cumplir 60 FPS, pero **debe documentarse** el FPS resultante y los draw calls si supera 8. El objetivo es conocer el punto de degradación para: (a) fijar el tope real de datos, y (b) justificar LOD/prescindibilidad de ingredientes (RNF-02).

> [!CAUTION]
> Siempre medir con `devicePixelRatio` capado a 2.0 (ver `core/Resizer.ts`) y con la misma GPU/reference profile; los números entre hardware distinto no son comparables. Fijar una máquina de referencia en CI (Node + headless con SwiftShader/ANGLE) para el test de draw calls y la FPS nominal.

---

## 3. Métricas de Carga (RNF-06)

### 3.1 Herramientas

- **Lighthouse CI** (integración en GitHub Actions y ad-hoc en DevTools).
- **WebPageTest** (multi-lugar, multi-condición de red).
- **`performance.mark()` / `performance.measure()`** + `PerformanceObserver` para hitos internos.

### 3.2 Hitos de Carga Instrumentados

```typescript
// frontend/src/main.ts
performance.mark('gaia:boot');
// ... creación de renderer, cargando texturas/heightmap en paralelo con workers ...
performance.mark('gaia:globe-ready');   // globo interactivo (RF-01)
performance.measure('fcp', 'gaia:boot', 'gaia:globe-ready');
```

| Hito                        | Objetivo | Medición |
| --------------------------- | -------- | -------- |
| **FCP** (First Contentful Paint) | **< 2.0 s** | Lighthouse / web-vitals |
| **Globo interactivo funcional**   | **< 3.5 s** | `gaia:globe-ready` |
| LCP (opcional, informativo)       | < 3.0 s    | web-vitals |

### 3.3 Condiciones de Red Simuladas

| Perfil      | RTT      | Throughput down | Applica a |
| ----------- | -------- | --------------- | --------- |
| Cable       | 0 ms     | 100 Mbps        | Budget estricto |
| **4G**      | 40 ms    | 9 Mbps          | Referencia de CI |
| 3G Fast     | 150 ms   | 1.6 Mbps        | Caso límite (RNF-06) |

> La referencia oficial de CI es **4G** (perfil equivalente a Lighthouse throttling). El caso 3G es informativo y solo informa al diseño de carga (tiles, code splitting).

### 3.4 Presupuesto de Bundle

| Asset                    | Tamaño objetivo (gzip) | Nota                                   |
| ------------------------ | ---------------------- | -------------------------------------- |
| Chunk de arranque (main) | ≤ 180 KB               | App mínima + React core                 |
| Chunk Three.js           | ≤ 250 KB               | Cargado bajo demanda (code splitting)   |
| React + HUD              | ≤ 120 KB               | Vía `build.rollupOptions.output.manualChunks`
| Texturas / heightmap     | *streaming por tiles*  | TileManager de GLOBOTextures (Esri/Terrarium) |
| **Total JS inicial**     | **≤ 450 KB**           | Verificado en CI con `size-limit` o `rollup-plugin-visualizer` |

> [!IMPORTANT]
> El cumplimiento de FCP < 2.0 s depende de **no bloquear el bundle con Three.js**: el globo base lo dibuja el chunk principal, y los módulos pesados (viento/sismos) se descargan bajo demanda cuando se activa la capa (Workflow 1, RNF-06).

---

## 4. Pruebas de Memoria GPU (RNF-04)

### 4.1 Herramientas

- **`renderer.info.memory`** de Three.js → `geometries`, `textures`, `programs`.
- **Chrome DevTools → Memory** → heap JS en vivo.
- **Chrome Task Manager** → memoria del proceso GPU (indirecta).
- **`gl.getParameter`** (debug avanzado) → conteo de objetos GL retenidos.

### 4.2 Procedimiento: Ciclo de Toggle 100×

Se alternan capas y filtros **100 veces consecutivas** verificando que no haya fuga neta de objetos GPU:

```typescript
// frontend/tests/memory/vram-leak.spec.ts
async function runToggleStress(count = 100) {
  const before = dumpGPUInfo(); // geometries, textures, programs

  const layers = ['fire', 'wind', 'seismic', 'flood', 'radiation'] as const;
  const filters = ['24h', '7d', '30d'] as const;

  for (let i = 0; i < count; i++) {
    toggleLayer(layers[i % layers.length]);   // on/off
    await nextFrame();
    if (i % 3 === 0) setTimeFilter(filters[i % filters.length]) ?? null;
    await nextFrame();
  }

  const after = dumpGPUInfo();

  expect(after).toEqual(before); // crecimiento neto CERO
}

function dumpGPUInfo() {
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs.length,
  };
}
```

### 4.3 Criterios de Aceptación

- **Crecimiento neto cero** de `geometries`, `textures` y `programs` tras el ciclo de 100 toggles + cambios de filtro.
- El **heap JS** (DevTools Memory) no crece de forma monótona entre ciclos (estabilización tras 2–3 GC).
- Los `InstancedMesh` reconstruidos después de un filtrado **nunca** se reasignan sin `dispose()` previo (ver [Workflow 6](./GAIA_WORKFLOWS.md)).

> [!CAUTION]
> Un crecimiento al que regenerar la misma capa con los mismos datos es una **fuga de VRAM** (bug de RNF-04), no un uso normal de memoria. Repetir 5 ciclos de 100 toggles antes de declarar el test verde (estabilización).

---

## 5. Tests de Resiliencia de Red (RNF-05)

### 5.1 Backend (pytest) — Cadena de Fallback

Se simulan fallos de APIs externas con **mock de `httpx`** (fixtures en `tests/conftest.py`):

| Fixture / Test | Simula                        | Verifica                                  |
| -------------- | ----------------------------- | ----------------------------------------- |
| `mocked_upstream_timeout` | `httpx.TimeoutException` | Respuesta `UPSTREAM_TIMEOUT`, luego caché/local |
| `mocked_upstream_5xx`     | HTTP 500/502 externo     | Respuesta `UPSTREAM_UNAVAILABLE`          |
| `mocked_upstream_429`     | HTTP 429 (rate-limit)    | Respuesta `UPSTREAM_RATE_LIMITED`         |
| `test_fallback.py`        | Fallo total de la API    | Cadena completa **Redis → API → Local**   |

```python
# backend/tests/test_fallback.py (esquema)
async def test_fallback_chain_redis_first(client, fake_redis, mocked_upstream_timeout):
    await fake_redis.setex("firms:24h", 300, CACHED_FIRMS)
    res = await client.get("/api/fires?hours=24")
    assert res.json()["data"]["cached"] is True        # ← vino de Redis

async def test_fallback_chain_local_last(client, fake_redis, mocked_upstream_error):
    # sin caché ni API → GeoJSON local del paquete (Workflow 7)
    res = await client.get("/api/fires?hours=24")
    assert res.json()["data"]["fallback"] is True
```

Orden de prioridad verificado: **1. Redis cache** (flags `cached`) → **2. API externa** → **3. GeoJSON local** (flags `fallback`).

### 5.2 Frontend (msw / fetch mock) — Indicador "MODO RESGUARDO"

Se mockean las peticiones de `frontend/src/services/*` con **Mock Service Worker (msw)**, y se verifica el flujo visual completo:

```typescript
// frontend/tests/resilience/fallback-ui.spec.tsx
server.use(rest.get('/api/fires', (_, res, ctx) => res(ctx.status(502), ctx.json({
  success: false, data: null,
  error: { code: 'UPSTREAM_UNAVAILABLE', message: '...' },
}))));

// Ha de producirse, vía orquestador → setConnectionStatus('fires', { state: 'fallback' })
render(<StatusIndicator />);
expect(screen.getByText('MODO RESGUARDO')).toBeInTheDocument();
```

Se verifica que:
1. El orquestador degrada `connectionStatus.fires.state` → `cached`/`fallback` (contrato `cached: true | fallback: true`).
2. `StatusIndicator` muestra el badge correcto (`CACHÉ`/`RESGUARDO`).
3. La experiencia 3D **no se rompe**: la capa sigue renderizándose con el dataset de respaldo.

### 5.3 Contrato de API (RNF-05 + contrato universal)

`tests/test_contract.py` recorre **todos** los endpoints y valida que la respuesta cumple el schema `{ success, data, error }` del [Contrato de API](./GAIA_API_CONTRACT.md), incluyendo casos de éxito, validación, upstream y 500 capturado por el middleware global.

---

## 6. Tests Unitarios y de Integración

### 6.1 Backend — pytest + httpx.AsyncClient

| Archivo                 | Qué verifica                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| `test_fires.py`         | `/api/fires`: 200, caché hit, fallback local, validación de `hours` (1–72)   |
| `test_quakes.py`        | `/api/earthquakes`: 200, validación de `days` (1–30) y `min_magnitude`, fallback |
| `test_wind.py`          | `/api/wind`: 200, formato de rejilla, metadata de componentes binarios       |
| `test_radiation.py`     | `/api/radiation`: **normalización CPM→µSv/h**, umbrales de alerta            |
| `test_elevation.py`     | `/api/elevation`: metros, caché de 24h                                       |
| `test_contract.py`      | Formato `{ success, data, error }` en **toda** respuesta                     |
| `test_fallback.py`      | Cadena Redis → API → local (RNF-05)                                          |

Casos críticos de normalización radiológica:

```python
def test_normalize_to_usvh():
    assert normalize_to_usvh(42.0, "CPM") == pytest.approx(42.0 / 334.0)   # Cs-137
    assert normalize_to_usvh(1.25, "uSv/h") == 1.25                         # ya normalizado
    assert normalize_to_usvh(1_000.0, "nSv/h") == pytest.approx(1.0)        # 1000 → 1.0
    assert normalize_to_usvh(5, "mSv/h") is None  # o raise UnknownUnit
```

Ejecución: `pytest backend/tests -q` en CI y local.

### 6.2 Frontend — Vitest (unidades puras)

Se prioriza **Vitest** (misma cadena TS/ESM que Vite/esbuild) sobre Jest. Casos clave:

| Archivo / Módulo          | Pruebas                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| `utils/coordinates.ts`    | `geodesicToCartesian(lat, lon, R)`: ecuador, polos, valores de muestra   |
| `utils/terrarium.ts`      | `decodeTerrarium(r, g, b)`: ceros, negativos (−100 m), picos             |
| `utils/colorScales.ts`    | FRP → color/tamaño (4 bandas), gradiente de magnitud, umbrales µSv/h     |
| `utils/dispose.ts`        | `disposeObject3D` libera geometry+material+textura (mock de `dispose`)   |
| `store/actions.ts`        | `toggleLayer`, `setSeaLevel` (clamping 0–10), `selectObject`/`clearSelection`, `setConnectionStatus` (assert sobre snapshot) |
| `services/*.service.ts`   | Con msw: payload correcto + manejo de `success:false` → `GaiaAPIError`   |

```typescript
// frontend/tests/store/actions.spec.ts
it('clampa el nivel del mar a [0, 10]', () => {
  setSeaLevel(-3);
  expect(state.flood.seaLevel).toBe(0);
  setSeaLevel(15);
  expect(state.flood.seaLevel).toBe(10);
});

it('abre y cierra la selección', () => {
  selectObject({ type: 'fire', instanceId: 12, lat: -12.4, lon: -54.3, data: fakeHotspot });
  expect(state.selectedObject?.type).toBe('fire');
  expect(state.telemetry.open).toBe(true);
  clearSelection();
  expect(state.selectedObject).toBeNull();
  expect(state.telemetry.open).toBe(false);
});
```

### 6.3 Tests de Web Workers (con mocks de `postMessage`)

Los workers no se ejecutan directamente (Comlink los envuelve); se testea la **lógica pura exportada** con el mensaje `Transferable` esperado:

```typescript
// frontend/tests/workers/ingestion.spec.ts
import { parseFIRMSData } from '../src/workers/ingestion.worker';

it('empaca Float32Array de 7 campos (x,y,z,r,g,b,scale)', () => {
  const buffer = parseFIRMSData(mockCSV, GLOBE_RADIUS);
  expect(buffer).toBeInstanceOf(Float32Array);
  expect(buffer.length % 7).toBe(0);
  expect(buffer[0]).toBeCloseTo(expectedX, 4); // conversión geodésica→cartesiana
});
```

Verificación clave: **los buffers son `Transferable`** (cero-copia) y los campos mantienen el orden contractado en `worker.types.ts` (`FIRES_READY`, `QUAKES_READY`, `WIND_READY`, `RADIATION_READY`).

---

## 7. Tests de Compatibilidad de Navegadores (RNF-07)

### 7.1 Navegadores Objetivo

| Navegador | Versión mínima | WebGL 2.0 | Web Workers |
| --------- | -------------- | :-------: | :---------: |
| Chrome    | última 2       | ✅        | ✅          |
| Firefox   | última 2       | ✅        | ✅          |
| Safari    | 15+            | ✅        | ✅          |
| Edge      | última 2 (Chromium) | ✅    | ✅          |

### 7.2 Detección de Capacidades

El arranque verifica WebGL 2.0 y muestra un aviso si falta (sin crash):

```typescript
const supportsWebGL2 = (() => {
  const canvas = document.createElement('canvas');
  return !!canvas.getContext('webgl2');
})();

if (!supportsWebGL2) {
  renderFallbackMessage(); // navigator.webgl2 unavailable
}
```

### 7.3 Automatización + Manual

- **Smoke automatizado (Playwright):** lanzar 4 browsers en CI (o BrowserStack/LambdaTest), verificar: el globo se renderiza (muestreo de píxeles del canvas), la consola no tiene errores GLSL, los 3 workers terminan de inicializar y el `StatusIndicator` llega a `LIVE`.
- **Manual (pre-release):** prueba interactiva completa (orbit, clic→telemetría, slider de nivel del mar, toggles) en cada navegador.

### 7.4 Checklist por Navegador

- [ ] Contexto WebGL 2.0 creado sin errores (`webglcontextcreationerror` ausente).
- [ ] Shaders **`.vert`/`.frag`** compilan en el primer frame (sin warnings de GLSL).
- [ ] Los 3 Web Workers responden (`worker.types` handshake).
- [ ] 60 FPS nominales con todas las capas (si el hardware lo permite).
- [ ] Raycasting sobre instancias funciona (telemetría).
- [ ] Cero excepciones JS no capturadas en 60 s de uso.

---

## 8. Matriz de Verificación: RNF ↔ Método de Prueba

| Requisito | Herramienta / Test                | Umbral de aceptación                     | Frecuencia               |
| --------- | --------------------------------- | ---------------------------------------- | ------------------------ |
| **RNF-01** FPS estable | `stats.js` + `perf/fps.spec.ts` + DevTools Performance | ≥ 60 FPS (p95 ≤ 18 ms) con > 20,000 datos | CI (perf job) + pre-deploy manual |
| **RNF-02** Draw calls ≤ 8 | `renderer.info.render.calls` (assert en perf test) | max drawCalls ≤ 8 por frame              | CI + pre-deploy          |
| **RNF-03** Cómputo en workers | Revisión de arquitectura + DevTools (main thread idle) | 0 parseos/interpolaciones en hilo principal | CI (lint/audit) + manual |
| **RNF-04** Cero fugas VRAM | `memory/vram-leak.spec.ts` + DevTools Memory | Crecimiento neto **cero** tras 100 toggles | Pre-deploy + nightly     |
| **RNF-05** Modo fallback | pytest (`test_fallback.py`) + msw (UI) | Cadena Redis→API→local + badge `RESGUARDO` | CI                      |
| **RNF-06** FCP / globo | Lighthouse CI + `performance.mark` | FCP < 2.0 s, globo < 3.5 s (perfil 4G)   | CI (PR) + pre-deploy     |
| **RNF-07** Navegadores | Playwright + BrowserStack | 4 browsers: render + workers + sin errores | CI (smoke) + manual pre-release |

### 8.1 Pipeline CI (GitHub Actions)

```
PR / push a main
   │
   ├─ 1. lint          eslint + tsc --noEmit (strict)
   ├─ 2. unit front    vitest run            (utils, store/actions, services)
   ├─ 3. unit backend  pytest -q             (endpoints + contract + fallback)
   ├─ 4. perf checks   draw calls + bundle budget (size-limit)
   ├─ 5. lighthouse    FCP / globo-ready (perfil 4G)
   ├─ 6. smoke e2e     Playwright (4 browsers, WebGL2)
   └─ 7. build         npm run build + Docker (solo en main) / deploy
```

Frecuencia recomendada: pasos 1–3 en **cada PR**; 4–6 en PRs a `main` (o programado/nightly para perf y VRAM); 7 solo al mergear a producción.

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md) del proyecto GAIA.*
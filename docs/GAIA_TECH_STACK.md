# GAIA — Stack Tecnológico

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.3  
> **Fecha:** 2026-09-23  

---

## 1. Resumen del Stack

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│                                                             │
│   TypeScript ─── Vite ──────── Three.js + GLSL             │
│        │              │              │                      │
│        │              │              ├── InstancedMesh       │
│        │              │              ├── Shaders .vert/.frag │
│        │              │              └── Transform Feedback  │
│        │              │                                      │
│        │              ├── ?raw / vite-plugin-glsl (GLSL)     │
│        │              ├── Web Workers (new URL(...))         │
│        │              └── Code Splitting (Three.js chunks)   │
│        │                                                     │
│        ├── React ──── Tailwind CSS ──── HUD Táctico          │
│        ├── Valtio ─── Estado reactivo (Proxy-based)          │
│        └── Comlink ── Comunicación tipada con Workers        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                     CONCURRENCIA                             │
│                                                              │
│   Web Worker 1: Ingesta + Spatial Hashing                    │
│   Web Worker 2: Octree 3D (Particionado Espacial)            │
│   Web Worker 3: Decodificación de Viento (GRIB2)             │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                       BACKEND                                │
│                                                              │
│   FastAPI (Python) ─── Uvicorn (ASGI)                        │
│        ├── Redis (Caché)                                     │
│        ├── PostgreSQL 18 + TimescaleDB (Históricos)          │
│        ├── Shapely / GeoPandas (Geoespacial)                 │
│        └── NumPy (Procesamiento de matrices GRIB2/NetCDF)    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                    FUENTES DE DATOS                           │
│                                                              │
│   NASA FIRMS │ USGS │ Open-Meteo │ GEBCO │ Safecast/EURDEP   │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Detallado por Capa

### 2.1 Lenguaje Base — TypeScript

| Aspecto       | Detalle                  |
| ------------- | ------------------------ |
| **Tecnología**| TypeScript (strict mode) |
| **Rol**       | Lenguaje principal del frontend |

#### Justificación Técnica

TypeScript con tipado estricto es fundamental en un proyecto de esta complejidad gráfica y computacional:

- **Coordenadas geoespaciales:** Interfaces tipadas para latitud, longitud, altitud y proyecciones evitan errores silenciosos en cálculos de posición sobre la esfera.
- **Buffers de memoria binarios:** Los `ArrayBuffer` y `Float32Array` que se transfieren entre Web Workers y el hilo principal (vía **Transferable Objects**, sin copia) requieren contratos de tipo claros para evitar corrupciones de datos.
- **Estructuras de datos WebGL:** Los uniforms, attributes y varyings de los shaders GLSL necesitan interfaces TypeScript que reflejen la forma exacta de los datos enviados a la GPU.

```typescript
// Ejemplo: tipado estricto para datos de incendio
interface FireHotspot {
  lat: number;
  lon: number;
  brightness: number;     // Kelvin
  frp: number;            // MW/km²
  instrument: 'VIIRS' | 'MODIS';
  confidence: 'low' | 'nominal' | 'high';
  acq_date: string;       // ISO 8601
}
```

---

### 2.2 Tooling & Bundler — Vite

| Aspecto       | Detalle                              |
| ------------- | ------------------------------------ |
| **Tecnología**| Vite (esbuild + Rollup)              |
| **Rol**       | Dev server con HMR y pipeline de compilación |

#### Justificación Técnica

Vite cubre el mismo pipeline (GLSL, Workers, code splitting) que Webpack, pero con **mucho menos boilerplate de configuración** y un **HMR muy superior**:

1. **Dev server sobre ESM nativo:**  
   Vite aprovecha los módulos ESM del navegador para servir el código tal cual durante el desarrollo, con hot module replacement casi instantáneo incluso con bundles grandes como Three.js (~600 KB).

2. **Carga de shaders GLSL como strings:**  
   Los `.vert`/`.frag` se importan directamente con el sufijo `?raw` (o el plugin `vite-plugin-glsl`), sin loaders custom:

   ```typescript
   // shaders.ts — Vite
   import atmosphereVert from './atmosphere.vert?raw';
   import atmosphereFrag from './atmosphere.frag?raw';
   ```

3. **Web Workers de primera clase:**  
   Con la misma sintaxis que Webpack — `new Worker(new URL('./worker.ts', import.meta.url))` — Vite empaqueta el worker en un chunk aparte con tipado y HMR, sin plugins externos.

4. **Code Splitting inteligente:**  
   Los `import()` dinámicos separan los chunks pesados (Three.js bajo demanda para viento/sismos), con hashes estables en producción (`build.rollupOptions.output.manualChunks`).

5. **Configuración declarativa y mantenible:**  
   En `vite.config.ts` se declaran los plugins (React + Tailwind + analyzer) de forma explícita; la build de producción usa **Rollup** con tree-shaking.

> [!NOTE]
> **¿Por qué Vite en lugar de Webpack?**
> Vite elimina el boilerplate que Webpack exige (loaders, plugins, dev server y CLI propios) manteniendo lo esencial del pipeline de GAIA: imports `?raw` de GLSL, workers vía `new URL(...)` y code-splitting por `import()`. Además su HMR recarga los shaders en caliente sin reiniciar el canvas ([GAIA_DEPLOYMENT](./GAIA_DEPLOYMENT.md)), y es la elección del plan maestro ([GAIA_ROADMAP](./GAIA_ROADMAP.md), F0.1.1/F0.4.4).

---

### 2.3 Motor 3D & Shaders — Three.js + GLSL

| Aspecto       | Detalle          |
| ------------- | ---------------- |
| **Tecnología**| Three.js + GLSL  |
| **Rol**       | Renderizado 3D, shaders, gestión de VRAM |

#### Justificación Técnica

Three.js proporciona **control absoluto** del pipeline de renderizado WebGL 2.0:

- **Ciclo de renderizado a 60 FPS:** Control explícito del `requestAnimationFrame` loop, delta time y actualización de escena.
- **Programación de shaders GLSL:** Escritura directa de vertex y fragment shaders para efectos atmosféricos (Fresnel/Rayleigh), ondas sísmicas y displacement de agua.
- **Gestión explícita de VRAM:** `InstancedMesh` para renderizar miles de geometrías idénticas (focos de incendio, columnas sísmicas) en una sola draw call.
- **Transform Feedback (WebGL 2.0):** Actualización de posiciones de partículas de viento directamente en la GPU sin roundtrip al CPU.

```glsl
// Ejemplo: fragment shader atmosférico (simplificado)
uniform vec3 uSunDirection;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  float fresnel = pow(1.0 - dot(vNormal, vViewDir), 3.0);
  float dayFactor = max(dot(vNormal, uSunDirection), 0.0);
  vec3 atmosphere = mix(vec3(0.05, 0.1, 0.3), vec3(0.3, 0.6, 1.0), fresnel);
  gl_FragColor = vec4(atmosphere * dayFactor, fresnel * 0.8);
}
```

---

### 2.4 UI & Dashboard — React

| Aspecto       | Detalle |
| ------------- | ------- |
| **Tecnología**| React   |
| **Rol**       | HUD táctico, paneles de telemetría, controles de capas |

#### Justificación Técnica

React se utiliza **exclusivamente para la capa de interfaz (DOM)**, no para el renderizado 3D:

- Renderizado del HUD táctico superpuesto al canvas WebGL.
- Ventanas flotantes de telemetría (datos de incendio, sismo, viento al hacer clic).
- Controles de capas y time-scrubber.
- Separación clara: **React gestiona el DOM, Three.js gestiona el canvas**.

---

### 2.5 Manejo de Estado — Valtio

| Aspecto       | Detalle                        |
| ------------- | ------------------------------ |
| **Tecnología**| Valtio (alternativa: Jotai)    |
| **Rol**       | Estado reactivo compartido entre Three.js y React |

#### Justificación Técnica

Valtio está basado en **Proxy de JavaScript** y es la alternativa perfecta para sincronizar estado entre un bucle de renderizado 3D a 60 FPS y una UI en React:

- **Mutación imperativa desde el render loop:**  
  En Three.js puedes mutar el estado directamente dentro del frame loop sin boilerplate:

  ```typescript
  // Dentro del loop de renderizado Three.js (60 FPS)
  state.selectedQuake.depth = newDepth;
  state.windSpeed = currentSpeed;
  ```

- **Re-renders quirúrgicos en React:**  
  Los componentes de React que lean `state.selectedQuake` se re-renderizarán de forma reactiva, pero **solo los componentes suscritos a esa propiedad específica**, sin forzar re-renders masivos.

- **Cero overhead en el render loop:**  
  A diferencia de Redux o Zustand (que requieren dispatchers o funciones set), Valtio permite escribir estado con sintaxis de asignación directa. El renderizador 3D actualiza la escena **sin ningún costo de sobrecarga** en React.

> [!NOTE]
> **¿Por qué Valtio en lugar de Zustand?**  
> Zustand requiere funciones `set()` para actualizar estado, lo cual introduce fricción en un bucle de renderizado que ejecuta 60 veces por segundo. Valtio usa Proxies mutables: `state.altitude = newValue` es todo lo que necesitas. Los componentes React que lean esa propiedad se actualizan automáticamente.

---

### 2.6 Concurrencia — Web Workers Nativos + Comlink

| Aspecto       | Detalle                          |
| ------------- | -------------------------------- |
| **Tecnología**| Web Workers nativos + Comlink    |
| **Rol**       | Procesamiento paralelo sin bloquear UI |

#### Justificación Técnica

- **Web Workers nativos:** Ejecutan el particionado espacial (Octree), decodificación de datos de viento/sismos y parseo de GeoJSON/CSV en hilos secundarios, evitando congelar el hilo principal de renderizado.
- **Comlink (de Google Chrome Labs):** Abstrae la comunicación `postMessage` entre el hilo principal y los workers con una API basada en Proxies y Promises. Permite llamar funciones del worker como si fueran locales, con tipado TypeScript completo.

```typescript
// main.ts — llamada al worker con Comlink
import { wrap } from 'comlink';

const worker = new Worker(new URL('./workers/ingestion.worker.ts', import.meta.url));
const api = wrap<IngestionWorker>(worker);

// Se llama como una función async normal
const hotspots = await api.parseFIRMSData(rawCSV);
```

---

### 2.7 Backend & Proxy — FastAPI (Python)

| Aspecto       | Detalle                                |
| ------------- | -------------------------------------- |
| **Tecnología**| FastAPI + Uvicorn (ASGI)               |
| **Rol**       | Proxy geoespacial, caché, procesamiento de datos |

#### Justificación Técnica

Python es el **lenguaje estándar en ciencia de datos y análisis espacial**. FastAPI actúa como capa intermedia entre el frontend y las APIs públicas externas:

1. **Rate-limiting y protección de cuotas:**  
   Las APIs de NASA FIRMS y USGS tienen límites de solicitudes. FastAPI centraliza las peticiones y controla la frecuencia para evitar bloqueos.

2. **Caché asíncrona con Redis:**  
   Guarda respuestas de la NASA y USGS en Redis para servir datos inmediatos al frontend en **< 20 ms**, sin depender de la latencia de las APIs externas.

   ```python
   @app.get("/api/fires")
   async def get_fires(hours: int = 24):
       cache_key = f"firms:{hours}h"
       cached = await redis.get(cache_key)
       if cached:
           return Response(content=cached, media_type="application/json")
       
       data = await fetch_firms_api(hours)
       await redis.setex(cache_key, 300, data)  # TTL: 5 min
       return data
   ```

3. **Procesamiento de matrices científicas:**  
   Procesamiento de archivos `.grib2` o `.netcdf` de vectores de viento usando **NumPy** antes de enviarlos simplificados en formato binario (`ArrayBuffer`) al frontend.

4. **Enriquecimiento geoespacial:**  
   Uso de **Shapely** y **GeoPandas** para operaciones espaciales como:
   - Determinar en qué país/región se ubica un foco de incendio.
   - Calcular intersecciones con polígonos de áreas protegidas.
   - Filtrar sismos por proximidad a centros urbanos.

5. **Persistencia de históricos (PostgreSQL 18 + TimescaleDB):**  
   SQLAlchemy (async + asyncpg) y migraciones **Alembic** archivan los snapshots ingeridos (incendios, sismos, viento, radiación, elevación) en **hipertablas temporales**, permitiendo servir `/api/history/*` con paginación y TTL físico por retención. La DB es solo archivo: el pipeline en caliente sigue siendo Redis → API externa ([GAIA_DATABASE](./GAIA_DATABASE.md)).

---

### 2.8 Estilos & UI Táctica — Tailwind CSS

| Aspecto       | Detalle       |
| ------------- | ------------- |
| **Tecnología**| Tailwind CSS  |
| **Rol**       | Estilado del HUD y dashboard |

#### Justificación Técnica

Tailwind CSS permite la construcción ágil de **HUDs oscuros, mínimos y de alta precisión**. El criterio visual (paleta, tipografía, iconos, layout centrado en el planeta) está definido en [GAIA_VISUAL_DESIGN](./GAIA_VISUAL_DESIGN.md):

- Clases utilitarias para diseño responsivo sin escribir CSS custom.
- Temas oscuros nativos con `dark:` para la estética orbital/telemetría del HUD.
- Composición rápida de paneles flotantes, barras laterales colapsables y controles de filtrado.

---

## 3. Tabla Resumen

| Capa / Módulo        | Tecnología                      | Rol Principal                                          |
| -------------------- | ------------------------------- | ------------------------------------------------------ |
| Lenguaje Base        | **TypeScript**                  | Tipado estricto para coordenadas, buffers y WebGL      |
| Tooling & Bundler    | **Vite** (esbuild + Rollup)         | Dev server con HMR, pipeline GLSL, Workers y code split |
| Motor 3D & Shaders   | **Three.js + GLSL**             | Renderizado 60 FPS, shaders, gestión de VRAM           |
| UI & Dashboard       | **React**                       | HUD táctico, telemetría, controles de capas            |
| Manejo de Estado     | **Valtio** (o Jotai)            | Estado reactivo Proxy-based entre Three.js y React     |
| Concurrencia         | **Web Workers + Comlink**       | Procesamiento paralelo sin bloquear UI                 |
| Backend & Proxy      | **FastAPI (Python) + PostgreSQL 18 / TimescaleDB** | Caché Redis, rate-limiting, normalización de $\mu\text{Sv/h}$, procesamiento geoespacial y archivo de históricos |
| Estilos              | **Tailwind CSS**                | HUD sobrio minimalista (ver [GAIA_VISUAL_DESIGN](./GAIA_VISUAL_DESIGN.md))          |
| Fuentes de Datos     | NASA FIRMS, USGS, Open-Meteo, GEBCO, **Safecast, EURDEP, RadNet, GMCMap** | Ingesta ambiental, sísmica, meteorológica y de radiación |

---

## 4. Diagrama de Flujo de Datos

```
  NASA FIRMS ──────────┐
  USGS ────────────────┤
  Open-Meteo ──────────┤──→ FastAPI (Python) ──→ Redis Cache
  GEBCO ───────────────┤         │
  Safecast / EURDEP ───┘         │ JSON / Binary ArrayBuffer (a Frontend)
                                 │
                                 ├───► PostgreSQL 18 + TimescaleDB (históricos)
                                 v
                            ┌─────────┐
                            │ Frontend │
                            │ (TS)    │
                            └────┬────┘
                                 │
              ┌──────────────────┼──────────────────┐
              v                  v                  v
          Worker 1           Worker 2           Worker 3
    (Ingesta + Radiación)   (Octree)           (Viento)
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │ Transferable Objects
                                 v
                          ┌─────────────┐
                          │  Three.js   │──→ Canvas WebGL 2.0
                          │  (GPU)      │
                          └──────┬──────┘
                                 │ Valtio (Proxy State)
                                 v
                          ┌─────────────┐
                          │   React     │──→ DOM (HUD Overlay)
                          │  + Tailwind │
                          └─────────────┘
```

---

*Este documento complementa la [Especificación Técnica de GAIA](./GAIA_SPECIFICATION.md) y define las decisiones tecnológicas del proyecto.*

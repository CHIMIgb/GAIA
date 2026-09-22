# GAIA — Especificación del Estado Global (Valtio)

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## 1. Propósito

Definir la forma (shape) completa del estado global de la aplicación gestionado con Valtio, las reglas de mutación desde Three.js y React, y los contratos de suscripción reactiva.

Este documento es la **única fuente de verdad** para el shape de `frontend/src/store/`. Toda propiedad que necesite ser compartida entre React y Three.js (o leída por ambos) debe vivir aquí; lo que no cruce esa frontera no debe entrar en el estado global.

---

## 2. Interfaz Raíz del Estado

### 2.1 Shape del Estado

```
GaiaState
├── layers: LayerVisibility          ← toggles de capas (5 subsistemas)
├── filters: { timeRange }           ← filtro temporal activo
├── flood: FloodState                ← nivel del mar + estado del shader
├── selectedObject: SelectedObject|null  ← selección por raycasting (unión discriminada)
├── telemetry: TelemetryPanel        ← contenedor del panel flotante del HUD
├── connectionStatus: ConnectionStatus   ← estado live/cached/fallback/error por módulo
├── performance: PerformanceCounters ← FPS, frame time, draw calls
├── wind: WindStats                  ← telemetría efímera del módulo de viento
├── seismic: SeismicStats            ← estado de la onda de choque activa
├── radiation: RadiationStats        ← contador de lecturas críticas (> 1.0 µSv/h)
└── debug: { showStats }             ← overlay de métricas (solo desarrollo)
```

### 2.2 Interfaz `GaiaState`

```typescript
// frontend/src/store/state.types.ts

export interface GaiaState {
  /** Toggles de visibilidad de las 5 capas del globo. */
  layers: LayerVisibility;

  /** Filtro temporal activo (24h, 7d, 30d). */
  filters: { timeRange: TimeFilter };

  /** Subsistema de inundación: nivel del mar y flags del water shader. */
  flood: FloodState;

  /** Objeto seleccionado por raycasting. `null` cuando no hay selección. */
  selectedObject: SelectedObject | null;

  /** Contenedor del panel flotante de telemetría. */
  telemetry: TelemetryPanel;

  /** Estado de conexión / modo resguardo por módulo de datos e infraestructura. */
  connectionStatus: ConnectionStatus;

  /** Contadores de rendimiento medidos por el render loop. */
  performance: PerformanceCounters;

  /** Telemetría efímera del módulo de viento (leída por React al seleccionar). */
  wind: WindStats;

  /** Estado de la onda de choque sísmica reciente (< 2h). */
  seismic: SeismicStats;

  /** Contador de lecturas radiológicas críticas para el badge de alerta. */
  radiation: RadiationStats;

  /** Flags de desarrollo (overlay de stats). */
  debug: { showStats: boolean };
}
```

### 2.3 Valores por Defecto

```typescript
// frontend/src/store/index.ts
import { proxy } from 'valtio';

const pending = (module: ModuleId): ModuleStatus => ({
  state: 'error',
  lastUpdate: null,
  cachedAt: null,
  lastError: `Sin respuesta inicial de ${module}`,
});

export const state = proxy<GaiaState>({
  layers: { fire: false, wind: false, seismic: false, flood: false, radiation: false },
  filters: { timeRange: '24h' },
  flood: { seaLevel: 0, waterShaderActive: true, waveAnimation: true },
  selectedObject: null,
  telemetry: { open: false, pinned: false, anchorX: 0, anchorY: 0 },
  connectionStatus: {
    fires: pending('fires'),
    quakes: pending('quakes'),
    wind: pending('wind'),
    radiation: pending('radiation'),
    elevation: pending('elevation'),
    backend: pending('backend'),
    workers: pending('workers'),
  },
  performance: { fps: 0, frameTimeMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  wind: { speedKnots: 0, particleCount: 18000 },
  seismic: { recentQuakeId: null, shockwaveActive: false },
  radiation: { criticalCount: 0 },
  debug: { showStats: false },
});
```

> [!NOTE]
> El estado inicial asume **sin datos**: todos los módulos parten en `error` con `lastUpdate: null`. La primera respuesta exitosa del orquestador de datos (Workflow 7) transiciona cada módulo a `live` (o `cached`/`fallback` según la fuente).

---

## 3. Sub-estados por Módulo

### 3.1 `LayerVisibility` — Toggles de capas

```typescript
export const GLOBE_LAYERS = ['fire', 'wind', 'seismic', 'flood', 'radiation'] as const;
export type LayerId = (typeof GLOBE_LAYERS)[number];

export interface LayerVisibility {
  fire: boolean;       // NASA FIRMS — InstancedMesh
  wind: boolean;       // Open-Meteo — sistema de partículas GPU
  seismic: boolean;    // USGS — columnas cilíndricas + ondas
  flood: boolean;      // GEBCO — water shader + mascarado costero
  radiation: boolean;  // Safecast/EURDEP/RadNet — InstancedMesh/heatmap
}
```

Regla asociada: desactivar una capa **no libera** su dataset en memoria, solo desactiva su visibilidad. La liberación de VRAM (RNF-04) solo ocurre al re-filtrar o destruir el módulo (ver `SceneManager.dispose()`).

### 3.2 `TimeFilter` — Rango temporal activo

```typescript
export type TimeFilter = '24h' | '7d' | '30d';

export const TIME_FILTER_OPTIONS: TimeFilter[] = ['24h', '7d', '30d'];
```

La propiedad viva es `state.filters.timeRange`. Al mutarla se dispara un **re-filtrado asíncrono** en los workers (efecto lateral orquestado desde `setTimeFilter()`), no una mutación síncrona de datos.

### 3.3 `FloodState` — Nivel del mar y estado del shader

```typescript
export const SEA_LEVEL_MIN = 0;
export const SEA_LEVEL_MAX = 10;

export interface FloodState {
  /** Nivel del mar en metros (0–10). Coincide con el slider del HUD. */
  seaLevel: number;
  /** Si el water shader de inundación está activo sobre el globo. */
  waterShaderActive: boolean;
  /** Displacement ondulante del shader (eff. visual, costo GPU bajo). */
  waveAnimation: boolean;
}
```

> [!NOTE]
> **Coherencia con Workflows:** en el documento [GAIA_WORKFLOWS](./GAIA_WORKFLOWS.md) (Workflow 5) se escribió `state.seaLevel` a modo de pseudocódigo. Aquí se adopta `state.flood.seaLevel` como **única fuente de verdad**. El shader de inundación (Three.js) lee exactamente esa propiedad en cada frame:
>
> ```typescript
> globeMaterial.uniforms.u_seaLevel.value = state.flood.seaLevel;
> ```

### 3.4 `SelectedObject` — Unión discriminada por raycasting

```typescript
export interface SelectionBase {
  /** Índice de la instancia dentro del InstancedMesh → índice del Float32Array del worker. */
  instanceId: number;
  lat: number;
  lon: number;
  /** Timestamp de selección (performance.now()). */
  selectedAt: number;
}

export interface FireSelection extends SelectionBase {
  type: 'fire';
  data: FireHotspot;        // brightness, frp, instrument, confidence, acq_date
}

export interface QuakeSelection extends SelectionBase {
  type: 'quake';
  data: Earthquake;         // depth_km, magnitude, place, time
}

export interface WindSelection extends SelectionBase {
  type: 'wind';
  data: WindVector;         // u, v, speed_knots, direction_deg
}

export interface RadiationSelection extends SelectionBase {
  type: 'radiation';
  data: RadiationReading;    // value_usvh, raw_value, raw_unit, station_id, alert_level
}

export type SelectedObject =
  | FireSelection
  | QuakeSelection
  | WindSelection
  | RadiationSelection;
```

Reglas de la selección:

- `instanceId` permite recuperar los datos crudos del `Float32Array` transferido por el worker **sin re-parsear** (Workflow 6, paso 2).
- **Nunca** guardar `THREE.Object3D` ni referencias de escena dentro de `selectedObject` — provocaría retención de memoria y rompería el snapshot inmutable de Valtio. Guardar solo datos serializables.
- El dominio de tipos (`FireHotspot`, `Earthquake`, `WindVector`, `RadiationReading`) coincide con el [Contrato de API](./GAIA_API_CONTRACT.md) y vive en `frontend/src/types/*.types.ts`.

### 3.5 `ConnectionStatus` — Estado por fuente de datos

```typescript
export type ConnectionState = 'live' | 'cached' | 'fallback' | 'error';

export const DATA_MODULES = ['fires', 'quakes', 'wind', 'radiation', 'elevation'] as const;
export type DataModuleId = (typeof DATA_MODULES)[number];

export const INFRA_MODULES = ['backend', 'workers'] as const;
export type InfraModuleId = (typeof INFRA_MODULES)[number];

export type ModuleId = DataModuleId | InfraModuleId;

export interface ModuleStatus {
  state: ConnectionState;
  /** Timestamp (ms) de la última respuesta útil. */
  lastUpdate: number | null;
  /** Timestamp (ms) del último dato que provino de caché Redis. */
  cachedAt: number | null;
  /** Mensaje del último error (contrato `error.message`), null si OK. */
  lastError: string | null;
}

export type ConnectionStatus = Record<ModuleId, ModuleStatus>;
```

| `state`      | Significado                                                          | Badge HUD  |
| ------------ | ------------------------------------------------------------------- | ---------- |
| `live`       | Datos frescos de la API externa (fetch OK).                        | `LIVE`     |
| `cached`     | API caída/cuota agotada, se sirvió caché Redis.                    | `CACHÉ`    |
| `fallback`   | Sin caché, se sirvió dataset local estático.                       | `RESGUARDO`|
| `error`      | Cadena de resiliencia completa falló o falta la primera respuesta. | `ERROR`    |

Los módulos de infraestructura (`backend`, `workers`) reflejan salud general del proxy y de los 3 Web Workers, e informan al `StatusIndicator` incluso sin capa activa.

### 3.6 `TelemetryPanel` — Contenedor del panel flotante

```typescript
export interface TelemetryPanel {
  /** Panel abierto (hay selección) o cerrado. */
  open: boolean;
  /** Si el usuario fijó el panel: no se cierra al hacer clic en vacío. */
  pinned: boolean;
  /** Anclaje en coordenadas CSS del overlay (por defecto sigue al cursor/clic). */
  anchorX: number;
  anchorY: number;
}
```

División de responsabilidades clara:

- `selectedObject` → **qué** se muestra (los datos).
- `telemetry` → **cómo** se muestra (contenedor, anclaje, pin).

`TelemetryPanel.tsx` renderiza el subpanel según `state.selectedObject.type` → `FireDetail | QuakeDetail | WindDetail | RadiationDetail` (RF-11).

### 3.7 `PerformanceCounters` — Contadores de rendimiento

```typescript
export interface PerformanceCounters {
  fps: number;              // media móvil de los últimos 60 frames (Clock.ts)
  frameTimeMs: number;      // delta del último frame
  drawCalls: number;        // renderer.info.render.calls (objetivo ≤ 8, RNF-02)
  triangles: number;        // renderer.info.render.triangles
  geometries: number;       // renderer.info.memory.geometries (VRAM)
  textures: number;         // renderer.info.memory.textures (VRAM)
}
```

### 3.8 Datos efímeros de módulo

```typescript
export interface WindStats {
  /** Velocidad muestreada del flujo en la selección activa (nudos). */
  speedKnots: number;
  /** Número de partículas vivas en el VBO. */
  particleCount: number;
}

export interface SeismicStats {
  /** ID del último sismo reciente (< 2h) que disparó la onda de choque. */
  recentQuakeId: string | null;
  /** Si el shader de onda concéntrica está animando (RF-08). */
  shockwaveActive: boolean;
}

export interface RadiationStats {
  /** Lecturas > 1.0 µSv/h — alimenta el badge de alerta crítica (RF-14). */
  criticalCount: number;
}
```

Estas propiedades se actualizan desde el hilo principal (render loop / orquestador) y **solo** porque React las lee (badges y detail panels). Cualquier otro dato de animación pura (tiempos de shockwave, fase del water shader) vive en uniforms del módulo y **no** entra al estado.

---

## 4. Reglas de Mutación

Valtio permite mutación imperativa desde ambos hilos. Para evitar **race conditions**, cada propiedad tiene **un único dueño de escritura** y reglas estrictas de lectura.

### 4.1 Escritura desde Three.js (render loop, 60 FPS)

El render loop muta directamente (sin dispatchers ni `setState`):

```typescript
// core/Stats.ts — dentro de requestAnimationFrame
state.performance.fps = clock.fps;
state.performance.frameTimeMs = clock.deltaTime * 1000;
state.performance.drawCalls = renderer.info.render.calls;
state.performance.triangles = renderer.info.render.triangles;
```

Lo que Three.js **posee** (puede escribir):

- `performance.*` (cada frame).
- `selectedObject` (al hacer clic / raycasting) — vía `selectObject()`.
- `wind.speedKnots` (muestreo del campo al seleccionar una partícula).
- `seismic.shockwaveActive` / `recentQuakeId` (detección de sismo < 2h).

Lo que Three.js **no posee** (solo lee):

- `flood.seaLevel` → actualiza el uniform `u_seaLevel` en cada frame.
- `layers.*` → `SceneManager.setVisible()` de cada módulo al cambiar el toggle.
- `filters.timeRange` → orquesta el re-filtrado en los workers.

### 4.2 Escritura desde React (event handlers)

React muta exclusivamente dentro de **handlers de eventos** (nunca durante el render):

```typescript
// hud/SeaLevelSlider.tsx — evento onChange
state.flood.seaLevel = nextValue;              // mutación directa
// o mejor, centralizado:
setSeaLevel(nextValue);
```

Lo que React **posee** (puede escribir):

- `layers.*` (toggles de `LayerControls`).
- `filters.timeRange` (selector de `TimeScrubber`).
- `flood.seaLevel`, `flood.waveAnimation` (slider y opciones avanzadas).
- `telemetry.*` (abrir/cerrar/pin/arrastrar el panel).
- `debug.showStats` (dev).

### 4.3 Tabla de Propiedad → Dueño

| Propiedad                     | Escriben (quién)                | Leen (quién)                          | Vía              |
| ----------------------------- | ------------------------------- | ------------------------------------- | ---------------- |
| `layers.*`                    | React — `LayerControls`         | Three.js — módulos (`setVisible`)     | Acción / directa |
| `filters.timeRange`           | React — `TimeScrubber`          | Orquestador (workers), módulos        | Acción           |
| `flood.seaLevel`              | React — `SeaLevelSlider`        | Three.js — uniform `u_seaLevel`       | Acción / directa |
| `flood.waterShaderActive`     | React — controles avanzados     | Three.js — `WaterMesh`                | Directa          |
| `flood.waveAnimation`         | React — controles avanzados     | Three.js — vertex shader de agua      | Directa          |
| `selectedObject`              | Three.js — raycasting           | React — `TelemetryPanel` + Three.js — highlight | Acción |
| `selectedObject = null`       | React (botón ✕) o Three.js (clic en vacío) | —                         | `clearSelection` |
| `telemetry.*`                 | React — `TelemetryPanel`        | React — `HUDLayout` (posicionamiento) | Directa          |
| `connectionStatus.*`          | Orquestador de datos (hilo principal, tras fetch/worker) | React — `StatusIndicator` | Acción |
| `performance.*`               | Three.js — render loop (`Stats`) | React — overlay debug (dev, throttled)| Directa          |
| `wind.speedKnots`             | Three.js — muestreo del campo   | React — `WindDetail`                  | Directa          |
| `seismic.shockwaveActive`     | Three.js — `SeismicModule`      | React — badge de sismo reciente       | Directa          |
| `radiation.criticalCount`     | Orquestador — resultado Worker 1| React — alerta HUD (`Badge critical`) | Directa          |

### 4.4 Reglas Transversales

1. **Los Web Workers nunca tocan el proxy.** Se comunican por `postMessage` (Comlink) con el hilo principal, que es el **único** que muta `state` (RNF-03).
2. **Nunca mutar `Float32Array`/`ArrayBuffer` dentro del proxy.** Al reemplazar un dataset recibido del worker:

   ```typescript
   // ✅ Correcto — reemplazar la referencia
   Object.assign(state, { fireBuffer: newBuffer });
   // ❌ Incorrecto — mutar el buffer dentro del estado
   state.fireBuffer[0] = x;
   ```

3. **El render loop nunca produce re-renders**: lee el proxy directo, jamás `useSnapshot()`, y no dispara `setState` de React.
4. **React nunca muta durante el render** — solo en handlers y acciones.
5. **Datos efímeros de animación** (tiempo de onda, fase, delta de partículas) viven en la instancia del módulo (`ShockwaveEffect`, `WaterMesh`), no en el estado. Solo entra al estado lo que React necesita leer.
6. **Clamping y normalización** se hacen en las acciones, no en los componentes: `setSeaLevel(-3)` → `0`, `setSeaLevel(15)` → `10`.

### 4.5 Mapeo de Ejemplos Históricos

Ejemplos sueltos de la documentación previa se consolidan en este shape:

| Referencia previa          | Propiedad oficial              |
| -------------------------- | ------------------------------ |
| `state.selectedQuake.depth` | `state.selectedObject.data.depth_km` |
| `state.windSpeed`          | `state.wind.speedKnots`        |
| `state.seaLevel`           | `state.flood.seaLevel`         |

---

## 5. Suscripciones Reactivas (React ↔ Three.js)

### 5.1 React — `useSnapshot()` (suscripción quirúrgica)

Los componentes React leen el estado con `useSnapshot(state)` y **solo se re-renderizan si cambian las propiedades que tocan durante el render** (Valtio rastrea acceso por propiedad).

```typescript
// frontend/src/store/hooks.ts
import { useSnapshot } from 'valtio';
import { state } from './index';

export const useGaiaState = () => useSnapshot(state);
export const useLayerVisibility = () => useSnapshot(state.layers);
export const useTimeFilter = () => useSnapshot(state.filters);
export const useSelectedObject = () => useSnapshot(state.selectedObject);
export const useConnectionStatus = () => useSnapshot(state.connectionStatus);
export const useFlood = () => useSnapshot(state.flood);
export const usePerformance = () => useSnapshot(state.performance);
```

```typescript
// hud/LayerControls.tsx — re-render quirúrgico al cambiar UN toggle
const layers = useSnapshot(state.layers);
return (
  <Toggle label="Incendios" checked={layers.fire} onChange={() => toggleLayer('fire')} />
  // ...
);
```

### 5.2 Three.js — Lectura directa del proxy (sin Reactividad)

El motor de renderizado lee el proxy en bruto; cero `useSnapshot`, cero overhead (enfoque documentado en [GAIA_TECH_STACK](./GAIA_TECH_STACK.md)):

```typescript
// modules/flood/FloodModule.ts — dentro del render loop
globeMaterial.uniforms.u_seaLevel.value = state.flood.seaLevel;
globeMaterial.uniforms.u_waveAnimation.value = state.flood.waveAnimation;

// modules/seismic/SeismicModule.ts
state.seismic.shockwaveActive = this.shockwave.isAnimating();
```

### 5.3 Tabla de Suscripción

| Componente                    | Lee                        | Se re-renderiza cuando...           |
| ----------------------------- | -------------------------- | ----------------------------------- |
| `LayerControls`               | `state.layers`             | cambia cualquier toggle de capa    |
| `TimeScrubber`                | `state.filters.timeRange`  | cambia el rango temporal           |
| `SeaLevelSlider`              | `state.flood.seaLevel`     | se desliza el nivel del mar (0–10m)|
| `StatusIndicator`             | `state.connectionStatus`   | cambia el estado de algún módulo   |
| `TelemetryPanel`              | `state.selectedObject.type`| se selecciona/limpia un objeto     |
| `FireDetail/QuakeDetail/...`  | `state.selectedObject.data`| cambian los datos de la selección  |
| Overlay debug (dev)           | `state.performance`        | cada commit de métricas (~2 Hz)    |
| Badge de alerta radiación     | `state.radiation.criticalCount` | cambia el contador crítico   |

### 5.4 Trampas y Advertencias

1. **El snapshot de `useSnapshot()` es inmutable por convención.** Nunca escribir sobre él:

   ```typescript
   const snap = useSnapshot(state);
   snap.layers.fire = true;          // ❌ no surte efecto
   toggleLayer('fire');               // ✅ mutar el proxy, nunca el snapshot
   ```

2. **Desestructurar solo lo necesario.** `const { layers } = useSnapshot(state)` suscribe a `layers`; `const snap = useSnapshot(state)` sin desestructurar suscribe a todo lo que el render toque → re-renders más amplios. Para paneles de telemetría usa los hooks de sub-estado (`useSelectedObject`, etc.).

3. **Throttling de métricas.** `performance.fps` se mide cada frame pero se **commitea al estado cada ~500 ms** (gate de tiempo), para no forzar 60 re-renders/segundo en el overlay debug. Este gate vive en `Stats.ts`.

4. **Suscripciones no-React.** Para reaccionar al estado sin renderizar un componente (por ejemplo: disparar el re-filtrado de workers al cambiar `filters.timeRange`), usa `subscribe()` de Valtio:

   ```typescript
   import { subscribe } from 'valtio';

   subscribe(state.filters, () => {
     requestRefilter(state.filters.timeRange); // efecto lateral, sin DOM
   });
   ```

---

## 6. Acciones y Transiciones

### 6.1 Catálogo de Acciones

```typescript
// frontend/src/store/actions.ts
import { state } from './index';
import type {
  LayerId, TimeFilter, SelectedObject, ModuleId, ModuleStatus,
} from './state.types';
import { SEA_LEVEL_MIN, SEA_LEVEL_MAX } from './state.types';

/** Activa/desactiva una capa. Dueño: React (LayerControls). */
export function toggleLayer(layer: LayerId): void {
  state.layers[layer] = !state.layers[layer];
}

/** Cambia el rango temporal y dispara el re-filtrado asíncrono en los workers. */
export function setTimeFilter(range: TimeFilter): void {
  const changed = state.filters.timeRange !== range;
  state.filters.timeRange = range;
  if (changed) requestRefilter(range); // efecto lateral no-reactivo
}

/** Actualiza el nivel del mar con clamping a [0, 10] m. Dueño: React (slider). */
export function setSeaLevel(meters: number): void {
  state.flood.seaLevel = Math.min(SEA_LEVEL_MAX, Math.max(SEA_LEVEL_MIN, meters));
}

/** Selecciona un objeto por raycasting y abre el panel de telemetría. */
export function selectObject(sel: SelectedObject): void {
  state.selectedObject = sel;
  state.telemetry.open = true;
  state.telemetry.pinned = false;
}

/** Limpia la selección activa y cierra el panel. */
export function clearSelection(): void {
  state.selectedObject = null;
  state.telemetry.open = false;
  state.telemetry.pinned = false;
}

/** Actualiza el estado de conexión de un módulo (merge parcial). */
export function setConnectionStatus(module: ModuleId, patch: Partial<ModuleStatus>): void {
  Object.assign(state.connectionStatus[module], patch);
}
```

### 6.2 Ciclo de Vida de la Selección

```
   [clic sobre instancia (fire|quake|wind|radiation)]
                 │
                 ▼   raycaster.intersectObject(...)
    instanceId = intersects[0].instanceId
                 │
                 ▼
  selectObject({ type, instanceId, lat, lon, data })   ← escribe Three.js
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
  React re-renderiza     Three.js aplica highlight
  TelemetryPanel
      ▲                     │
      │   [clic en vacío]   │  [clic en ✕ del panel]
      └─────────────────────┘
                 │
                 ▼
        clearSelection()   →  selectedObject = null, telemetry.open = false
```

### 6.3 Máquina de Estados de `connectionStatus`

```
                      fetch OK (fresco)
        ┌────────────────────────────────────────────►  live
        │                                                 │
        │                                                 │ upstream caído + Redis OK
        ▼                                                 ▼
      error ◄────────────────────────────────────────── cached
        ▲                                                   │
        │  cadena completa falla                           │ sin caché → GeoJSON local
        └────────────────────────────────────────────────── ▼
                                                          fallback
```

| Transición                     | Disparador                                        | Effecto                                  |
| ------------------------------ | ------------------------------------------------- | ---------------------------------------- |
| `error → live`                 | Respuesta exitosa de la API externa               | `lastUpdate = now`                       |
| `live → cached`                | Timeout / HTTP 5xx / 429, con caché Redis         | `cachedAt = now`, badge `CACHÉ`          |
| `cached → fallback`            | Sin caché Redis, dataset local cargado            | badge `RESGUARDO` (RNF-05)               |
| `live/cached/fallback → error` | Cadena de resiliencia completa falló              | `lastError` poblado, badge `ERROR`       |
| `* → live`                     | Siguiente poll exitoso (recuperación automática)  | `lastError = null`                       |

Toda transición la aplica el **orquestador de datos** (hilo principal) vía `setConnectionStatus()`, tras integrar la respuesta del contrato universal (`cached: true` / `fallback: true`) y los resultados de los workers.

### 6.4 Contratos de Entrada

| Invocada por...               | Acciones permitidas                        |
| ----------------------------- | ------------------------------------------ |
| Componentes React (`LayerControls`, `TimeScrubber`, `SeaLevelSlider`, `TelemetryPanel`) | `toggleLayer`, `setTimeFilter`, `setSeaLevel`, `clearSelection` |
| Handlers de clic en el canvas (Three.js / `Engine.ts`) | `selectObject`, `clearSelection` |
| Orquestador de datos (`main.ts` / servicios + worker results) | `setConnectionStatus` |

> [!IMPORTANT]
> `selectedObject` tiene **dos** escritores válidos (Three.js al clicar, React/Three.js al limpiar), pero ambos pasan por la misma acción. Esta es la única propiedad con doble entrada; el resto respeta la tabla de dueños de la sección 4.3.

---

*Este documento complementa el [Stack Tecnológico](./GAIA_TECH_STACK.md) y los [Workflows](./GAIA_WORKFLOWS.md) del proyecto GAIA.*
# GAIA — Estructura del Proyecto

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-21  

---

## 1. Estructura Raíz del Monorepo

```
GAIA/
├── docs/                              ← Documentación técnica
├── frontend/                          ← Aplicación WebGL + React (TypeScript)
├── backend/                           ← Proxy API (FastAPI / Python)
├── docker-compose.yml                 ← Orquestación backend + Redis + PostgreSQL
├── .env.example                       ← Plantilla de variables de entorno
├── .gitignore
└── README.md                          ← Punto de entrada del repositorio
```

---

## 2. Frontend — Árbol Completo

```
frontend/
├── public/
│   ├── index.html                     ← HTML raíz (mount del canvas WebGL + React root)
│   └── favicon.ico
│
├── src/
│   ├── main.ts                        ← Punto de entrada: inicializa Core, monta React, arranca Workers
│   ├── env.d.ts                       ← Declaraciones de módulos GLSL (.vert, .frag) para TypeScript
│   │
│   ├── core/                          ← Motor de renderizado Three.js
│   │   ├── Engine.ts                  ← Clase principal: crea Scene, Camera, Renderer, ejecuta render loop
│   │   ├── SceneManager.ts            ← Gestión de objetos en la escena (add/remove/dispose)
│   │   ├── CameraController.ts        ← OrbitControls + zoom limits + damping
│   │   ├── Clock.ts                   ← deltaTime, elapsed, FPS counter
│   │   ├── Resizer.ts                 ← Listener de resize + actualización de aspect ratio y pixel ratio
│   │   └── Stats.ts                   ← Integración de stats.js + lectura de renderer.info (draw calls, triangles)
│   │
│   ├── shaders/                       ← Archivos GLSL organizados por módulo
│   │   ├── globe/
│   │   │   ├── atmosphere.vert        ← Vertex shader: posiciones para halo atmosférico
│   │   │   ├── atmosphere.frag        ← Fragment shader: dispersión Fresnel/Rayleigh + ciclo día/noche
│   │   │   ├── terrain.vert           ← Vertex shader: displacement de heightmap (Terrarium decode)
│   │   │   └── terrain.frag           ← Fragment shader: textura satelital + iluminación
│   │   ├── fire/
│   │   │   ├── fire.vert              ← Vertex shader: posicionamiento de instancias sobre la esfera
│   │   │   └── fire.frag              ← Fragment shader: gradiente FRP (amarillo → rojo → blanco)
│   │   ├── wind/
│   │   │   ├── particle.vert          ← Vertex shader: lectura de DataTexture (U,V) + desplazamiento
│   │   │   └── particle.frag          ← Fragment shader: color por velocidad + fade por TTL
│   │   ├── seismic/
│   │   │   ├── column.vert            ← Vertex shader: posición y escala de cilindros instanciados
│   │   │   ├── column.frag            ← Fragment shader: gradiente por magnitud
│   │   │   ├── shockwave.vert         ← Vertex shader: vértices del anillo concéntrico
│   │   │   └── shockwave.frag         ← Fragment shader: expansión radial animada (ondas P/S)
│   │   ├── flood/
│   │   │   ├── water.vert             ← Vertex shader: superficie de agua con displacement
│   │   │   └── water.frag             ← Fragment shader: comparación elevación vs u_seaLevel + refracción
│   │   └── radiation/
│   │       ├── radiation.vert         ← Vertex shader: posiciones de sensores instanciados
│   │       └── radiation.frag         ← Fragment shader: color por umbral µSv/h + parpadeo crítico
│   │
│   ├── modules/                       ← Módulos de visualización (1 carpeta = 1 subsistema)
│   │   ├── globe/
│   │   │   ├── GlobeModule.ts         ← Orquestador: crea la esfera, aplica texturas y shaders
│   │   │   ├── TerrainMesh.ts         ← SphereGeometry + ShaderMaterial con displacement
│   │   │   ├── AtmosphereMesh.ts      ← Esfera exterior con shader de dispersión atmosférica
│   │   │   ├── TileManager.ts         ← Descarga y caché de tiles satelitales (Esri) y DEM (Terrarium)
│   │   │   └── CoastlineOverlay.ts    ← Líneas de Natural Earth renderizadas con LineSegments
│   │   │
│   │   ├── fire/
│   │   │   ├── FireModule.ts          ← Orquestador: lifecycle de la capa de incendios
│   │   │   ├── FireInstancedMesh.ts   ← Creación y actualización del InstancedMesh de focos
│   │   │   └── FireColorScale.ts      ← Mapeo FRP → color RGBA + escala de tamaño
│   │   │
│   │   ├── wind/
│   │   │   ├── WindModule.ts          ← Orquestador: lifecycle de la capa de viento
│   │   │   ├── WindParticleSystem.ts  ← VBO de partículas + Transform Feedback loop
│   │   │   └── WindDataTexture.ts     ← Creación de DataTexture RGBA desde rejilla (U,V)
│   │   │
│   │   ├── seismic/
│   │   │   ├── SeismicModule.ts       ← Orquestador: lifecycle de la capa sísmica
│   │   │   ├── QuakeInstancedMesh.ts  ← InstancedMesh de cilindros (magnitud → radio, profundidad → altura)
│   │   │   └── ShockwaveEffect.ts     ← Shader de anillo concéntrico para sismos recientes (< 2h)
│   │   │
│   │   ├── flood/
│   │   │   ├── FloodModule.ts         ← Orquestador: lifecycle de la capa de inundación
│   │   │   └── WaterMesh.ts           ← Malla de agua con uniform u_seaLevel y shader refractivo
│   │   │
│   │   └── radiation/
│   │       ├── RadiationModule.ts     ← Orquestador: lifecycle de la capa de radiación
│   │       ├── RadiationMesh.ts       ← InstancedMesh o heatmap esférico de lecturas radiológicas
│   │       └── AlertThresholds.ts     ← Umbrales de µSv/h → nivel de alerta → color + parpadeo
│   │
│   ├── workers/                       ← Web Workers con API Comlink
│   │   ├── ingestion.worker.ts        ← Worker 1: parseo de CSV/GeoJSON, conversión geodésica→cartesiana,
│   │   │                                 escalado FRP, normalización CPM→µSv/h, empaquetado Float32Array
│   │   ├── spatial.worker.ts          ← Worker 2: construcción de Octree 3D, consultas de proximidad
│   │   ├── wind.worker.ts             ← Worker 3: decodificación de rejilla de viento (U,V),
│   │   │                                 cálculo de magnitudes/direcciones, generación de DataTexture
│   │   └── worker.types.ts            ← Tipos compartidos: interfaces de mensajes Transferable,
│   │                                     enums de tipos de mensaje (FIRES_READY, QUAKES_READY, etc.)
│   │
│   ├── components/                    ← Componentes React del HUD (DOM overlay)
│   │   ├── App.tsx                    ← Componente raíz React: layout del HUD sobre el canvas
│   │   ├── hud/
│   │   │   ├── HUDLayout.tsx          ← Layout principal del overlay: sidebar + bottom bar + panels
│   │   │   ├── LayerControls.tsx      ← Toggles de capas: Fuego, Viento, Sismos, Inundación, Radiación
│   │   │   ├── TimeScrubber.tsx       ← Selector de rango temporal: 24h / 7d / 30d
│   │   │   ├── SeaLevelSlider.tsx     ← Slider de nivel del mar (+0m a +10m)
│   │   │   └── StatusIndicator.tsx    ← Badge de estado: "LIVE" / "CACHÉ" / "MODO RESGUARDO"
│   │   ├── panels/
│   │   │   ├── TelemetryPanel.tsx     ← Panel flotante: datos del objeto seleccionado (clic/raycasting)
│   │   │   ├── FireDetail.tsx         ← Subpanel: coordenadas, FRP, brightness, instrumento, confianza
│   │   │   ├── QuakeDetail.tsx        ← Subpanel: coordenadas, magnitud, profundidad, lugar, timestamp
│   │   │   ├── WindDetail.tsx         ← Subpanel: coordenadas, velocidad (nudos), dirección, U, V
│   │   │   └── RadiationDetail.tsx    ← Subpanel: coordenadas, µSv/h, valor raw, unidad, station_id, alerta
│   │   └── common/
│   │       ├── Badge.tsx              ← Badge reutilizable con variantes de color (normal/warning/critical)
│   │       ├── Toggle.tsx             ← Switch on/off estilizado con Tailwind
│   │       └── Slider.tsx             ← Slider numérico reutilizable
│   │
│   ├── store/                         ← Estado global Valtio
│   │   ├── index.ts                   ← Creación del proxy state + export global
│   │   ├── state.types.ts             ← Interfaz GaiaState y sub-interfaces tipadas
│   │   ├── actions.ts                 ← Funciones de mutación: toggleLayer, setTimeFilter, selectObject, etc.
│   │   └── hooks.ts                   ← Hooks React: useGaiaState(), useLayerVisibility(), useSelectedObject()
│   │
│   ├── services/                      ← Capa de comunicación con el backend
│   │   ├── api.ts                     ← fetchAPI<T>(): wrapper tipado de fetch + manejo de contrato universal
│   │   ├── fires.service.ts           ← getFires(hours): GET /api/fires
│   │   ├── quakes.service.ts          ← getQuakes(days, minMag): GET /api/quakes
│   │   ├── wind.service.ts            ← getWindGrid(resolution): GET /api/wind
│   │   ├── radiation.service.ts       ← getRadiation(lat, lon, radius): GET /api/radiation
│   │   └── elevation.service.ts       ← getElevation(lat, lon): GET /api/elevation
│   │
│   ├── types/                         ← Interfaces y tipos TypeScript globales
│   │   ├── api.types.ts               ← APIResponse<T>, APIError (contrato universal)
│   │   ├── fire.types.ts              ← FireHotspot, FIRMSResponse, FRPLevel
│   │   ├── quake.types.ts             ← Earthquake, USGSFeature, QuakeAlertLevel
│   │   ├── wind.types.ts              ← WindVector, WindGridMeta, WindComponent
│   │   ├── radiation.types.ts         ← RadiationReading, RadiationSource, AlertLevel
│   │   ├── flood.types.ts             ← FloodState, SeaLevelRange
│   │   ├── globe.types.ts             ← TileCoord, ElevationData, TerrainConfig
│   │   └── worker.messages.ts         ← Uniones discriminadas de mensajes Worker ↔ Main thread
│   │
│   ├── utils/                         ← Funciones utilitarias puras
│   │   ├── coordinates.ts             ← geodesicToCartesian(lat, lon, radius) → Vector3
│   │   ├── terrarium.ts               ← decodeTerrarium(r, g, b) → elevation en metros
│   │   ├── colorScales.ts             ← Funciones de interpolación de color para FRP, magnitud, µSv/h
│   │   ├── tilemath.ts                ← Cálculos de tiles: lat/lon ↔ tile coords (x, y, z)
│   │   └── dispose.ts                 ← disposeObject3D(obj): libera geometry + material + texture recursivamente
│   │
│   └── assets/                        ← Datos estáticos empaquetados en el build
│       ├── textures/
│       │   ├── earth_diffuse_4k.jpg   ← Textura satelital de respaldo (baja resolución)
│       │   ├── earth_specular.jpg     ← Mapa especular (brillo de océanos)
│       │   └── earth_normal.jpg       ← Mapa de normales para iluminación detallada
│       ├── geodata/
│       │   ├── ne_110m_coastline.json ← Natural Earth: líneas de costa (1:110m, baja resolución)
│       │   ├── ne_110m_countries.json ← Natural Earth: fronteras de países
│       │   └── PB2002_boundaries.json ← Placas tectónicas (Peter Bird)
│       └── fallback/
│           ├── firms_sample.json      ← Dataset de respaldo: incendios de muestra
│           ├── quakes_sample.json     ← Dataset de respaldo: sismos de muestra
│           └── radiation_sample.json  ← Dataset de respaldo: radiación de muestra
│
├── webpack.config.js                  ← Configuración Webpack 5 (GLSL loader, Workers, code splitting)
├── webpack.dev.js                     ← Overrides para desarrollo (devServer, source maps)
├── webpack.prod.js                    ← Overrides para producción (minificación, tree-shaking)
├── tsconfig.json                      ← Configuración TypeScript (strict mode, paths)
├── tailwind.config.js                 ← Configuración Tailwind CSS (tema oscuro, colores custom)
├── postcss.config.js                  ← PostCSS: autoprefixer + tailwindcss
├── package.json                       ← Dependencias y scripts npm
└── .eslintrc.js                       ← Reglas de linting TypeScript + React
```

---

## 3. Backend — Árbol Completo

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                        ← Punto de entrada: FastAPI app + Uvicorn + middleware CORS + error handler global
│   ├── config.py                      ← Settings con Pydantic BaseSettings (.env binding)
│   │
│   ├── models/                        ← Modelos Pydantic (schemas de request/response)
│   │   ├── __init__.py
│   │   ├── response.py                ← APIResponse, APIError (contrato universal)
│   │   ├── fire.py                    ← FireHotspot, FIRMSQueryParams
│   │   ├── quake.py                   ← Earthquake, USGSQueryParams
│   │   ├── wind.py                    ← WindGridResponse, WindQueryParams
│   │   ├── radiation.py               ← RadiationReading, RadiationQueryParams, AlertLevel enum
│   │   └── elevation.py               ← ElevationResponse, ElevationQueryParams
│   │
│   ├── routers/                       ← Endpoints agrupados por módulo funcional
│   │   ├── __init__.py
│   │   ├── fires.py                   ← GET /api/fires — proxy NASA FIRMS + caché Redis
│   │   ├── quakes.py                  ← GET /api/quakes — proxy USGS + caché Redis
│   │   ├── wind.py                    ← GET /api/wind — proxy Open-Meteo + procesamiento de rejilla
│   │   ├── radiation.py               ← GET /api/radiation — proxy Safecast/EURDEP + normalización µSv/h
│   │   ├── elevation.py               ← GET /api/elevation — proxy Open-Meteo Elevation
│   │   ├── history.py                 ← GET /api/history/* — rangos históricos desde PostgreSQL 18
│   │   └── health.py                  ← GET /health — estado del servidor, Redis, PostgreSQL y APIs
│   │
│   ├── services/                      ← Lógica de negocio (aislada de los routers)
│   │   ├── __init__.py
│   │   ├── firms_client.py            ← Fetch asíncrono a NASA FIRMS API (VIIRS/MODIS)
│   │   ├── usgs_client.py             ← Fetch asíncrono a USGS Earthquake API (feeds GeoJSON)
│   │   ├── openmeteo_client.py        ← Fetch asíncrono a Open-Meteo (viento + elevación)
│   │   ├── safecast_client.py         ← Fetch asíncrono a Safecast API (radiación global)
│   │   ├── eurdep_client.py           ← Fetch asíncrono a EURDEP / JRC REMON (radiación Europa)
│   │   ├── radiation_normalizer.py    ← Conversión de unidades: CPM → µSv/h, nSv/h → µSv/h
│   │   └── http_client.py             ← httpx.AsyncClient compartido: timeouts, reintentos, headers comunes
│   │
│   ├── cache/                         ← Integración con Redis
│   │   ├── __init__.py
│   │   ├── redis_client.py            ← Conexión singleton a Redis (aioredis)
│   │   └── cache_keys.py              ← Constantes de claves de caché + TTLs por módulo
│   │
│   ├── db/                            ← Persistencia de históricos (PostgreSQL 18 + TimescaleDB)
│   │   ├── __init__.py
│   │   ├── database.py                ← Engine/Session async SQLAlchemy (asyncpg) desde DATABASE_URL
│   │   ├── models.py                  ← ORM: FireHotspot, Earthquake, WindFrame, RadiationReading, ElevationSample, SessionEvent
│   │   ├── ingest.py                  ← Jobs periódicos: upsert con dedup desde Redis/upstream
│   │   ├── queries.py                 ← Consultas históricas paginadas (rangos temporales) para /api/history/*
│   │   └── session_store.py           ← Registro de sesiones anonimizadas (hash de cookie) — ver GAIA_SECURITY §9
│   │
│   ├── alembic/                       ← Migraciones de esquema de la DB
│   │   ├── env.py                     ← Configuración de Alembic sobre DATABASE_URL
│   │   └── versions/                  ← Revisiones de migración (una por cambio de schema)
│   │
│   └── fallback/                      ← Datasets estáticos de resguardo (Workflow 7)
│       ├── firms_latest.json          ← Snapshot reciente de incendios NASA FIRMS
│       ├── quakes_latest.json         ← Snapshot reciente de sismos USGS
│       ├── wind_grid_latest.bin       ← Rejilla de viento binaria pre-procesada
│       └── radiation_latest.json      ← Snapshot reciente de lecturas Safecast
│
├── tests/                             ← Tests del backend
│   ├── __init__.py
│   ├── conftest.py                    ← Fixtures pytest: FastAPI TestClient, Redis mock
│   ├── test_fires.py                  ← Tests del endpoint /api/fires y servicio FIRMS
│   ├── test_quakes.py                 ← Tests del endpoint /api/quakes y servicio USGS
│   ├── test_wind.py                   ← Tests del endpoint /api/wind y servicio Open-Meteo
│   ├── test_radiation.py              ← Tests del endpoint /api/radiation + normalización µSv/h
│   ├── test_elevation.py              ← Tests del endpoint /api/elevation
│   ├── test_contract.py               ← Verifica que TODA respuesta cumple el schema { success, data, error }
│   └── test_fallback.py               ← Simula fallo de API externa → verifica cadena de resiliencia
│
├── requirements.txt                   ← Dependencias Python (pip)
├── pyproject.toml                     ← Metadata del proyecto Python + configuración de herramientas
├── Dockerfile                         ← Imagen Docker para producción (python:3.12-slim + uvicorn)
└── .env.example                       ← Variables de entorno del backend
```

---

## 4. Archivos de Configuración Raíz

```
GAIA/
├── docker-compose.yml                 ← Orquesta: backend (FastAPI) + redis (Redis 7) + db (PostgreSQL 18)
├── .env.example                       ← Plantilla de variables de entorno para el monorepo
├── .gitignore                         ← Ignora node_modules, __pycache__, .env, dist/, build/
└── README.md                          ← Punto de entrada: descripción + enlaces a docs/
```

---

## 5. Detalle de Archivos Clave por Directorio

### 5.1 `frontend/src/core/` — Motor de Renderizado

| Archivo               | Responsabilidad                                                                |
| --------------------- | ------------------------------------------------------------------------------ |
| `Engine.ts`           | Clase principal. Crea `WebGLRenderer`, `Scene`, `PerspectiveCamera`. Ejecuta el `requestAnimationFrame` loop. Llama a `update()` en cada módulo activo y `render()` en cada frame. Expone `renderer.info` para métricas de draw calls. |
| `SceneManager.ts`     | Registra y desregistra módulos en la escena. Gestiona el ciclo de vida: `init()` → `update(dt)` → `dispose()`. Garantiza que `dispose()` se invoque al remover cualquier objeto. |
| `CameraController.ts` | Wrapper de `OrbitControls`. Configura límites de zoom (min/max distance), damping, auto-rotate inicial y restricción de ángulo polar. |
| `Clock.ts`            | Encapsula `THREE.Clock`. Expone `deltaTime`, `elapsedTime` y un contador de FPS rolling (media de últimos 60 frames). |
| `Resizer.ts`          | Escucha `window.resize`. Actualiza `camera.aspect`, `camera.updateProjectionMatrix()` y `renderer.setSize()`. Gestiona `devicePixelRatio` con cap a 2.0 para rendimiento. |
| `Stats.ts`            | Integración opcional de `stats.js`. Lee `renderer.info.render.calls` (draw calls) y `renderer.info.memory` (geometrías, texturas en VRAM) para el panel de debug. |

---

### 5.2 `frontend/src/shaders/` — Shaders GLSL

| Directorio / Archivo     | Shader Type | Descripción                                                    | Requisito |
| ------------------------ | :---------: | -------------------------------------------------------------- | :-------: |
| `globe/atmosphere.vert`  | Vertex      | Posiciones del halo atmosférico exterior                       | RF-01     |
| `globe/atmosphere.frag`  | Fragment    | Dispersión Fresnel / Rayleigh + ciclo día/noche                | RF-01     |
| `globe/terrain.vert`     | Vertex      | Decodificación Terrarium RGB → displacement de vértices        | RF-02     |
| `globe/terrain.frag`     | Fragment    | Textura satelital (Esri) + iluminación Phong/Lambert           | RF-02     |
| `fire/fire.vert`         | Vertex      | Posicionamiento de instancias de incendio sobre la esfera      | RF-03     |
| `fire/fire.frag`         | Fragment    | Gradiente de color según FRP (amarillo → rojo → blanco)        | RF-04     |
| `wind/particle.vert`     | Vertex      | Lee DataTexture (U,V) y desplaza partículas por frame          | RF-05, RF-06 |
| `wind/particle.frag`     | Fragment    | Color por velocidad + desvanecimiento por tiempo de vida       | RF-05     |
| `seismic/column.vert`    | Vertex      | Escala de cilindros instanciados (radio=magnitud, alto=profundidad) | RF-07 |
| `seismic/column.frag`    | Fragment    | Gradiente por magnitud (verde → amarillo → rojo)               | RF-07     |
| `seismic/shockwave.vert` | Vertex      | Geometría del anillo concéntrico expansivo                     | RF-08     |
| `seismic/shockwave.frag` | Fragment    | Animación radial de ondas P y S                                | RF-08     |
| `flood/water.vert`       | Vertex      | Superficie de agua con leve desplazamiento ondulante           | RF-09     |
| `flood/water.frag`       | Fragment    | Comparación elevación vs `u_seaLevel` + transparencia/refracción | RF-10   |
| `radiation/radiation.vert`| Vertex     | Posiciones de sensores radiológicos instanciados               | RF-14     |
| `radiation/radiation.frag`| Fragment   | Color por umbral µSv/h + parpadeo animado si > 1.0            | RF-14     |

> Todos los archivos `.vert` y `.frag` se importan en TypeScript como strings gracias a la regla `asset/source` de Webpack 5.

---

### 5.3 `frontend/src/modules/` — Módulos de Visualización

Cada módulo implementa la interfaz `IGaiaModule`:

```typescript
interface IGaiaModule {
  readonly name: string;
  init(scene: THREE.Scene): Promise<void>;    // Crear geometrías y materiales
  update(dt: number): void;                    // Actualizar cada frame (60 FPS)
  setData(buffer: Float32Array): void;         // Recibir datos procesados del Worker
  setVisible(visible: boolean): void;          // Toggle de visibilidad
  dispose(): void;                             // Liberar VRAM: geometry + material + texture
}
```

| Módulo              | Archivos Principales             | Geometría GPU           | Draw Calls |
| ------------------- | -------------------------------- | ----------------------- | :--------: |
| `globe/`            | GlobeModule, TerrainMesh, AtmosphereMesh, TileManager | SphereGeometry + ShaderMaterial | 2 |
| `fire/`             | FireModule, FireInstancedMesh, FireColorScale | InstancedMesh (esferas) | 1 |
| `wind/`             | WindModule, WindParticleSystem, WindDataTexture | Points (VBO) + Transform Feedback | 1 |
| `seismic/`          | SeismicModule, QuakeInstancedMesh, ShockwaveEffect | InstancedMesh (cilindros) + Mesh (anillo) | 1–2 |
| `flood/`            | FloodModule, WaterMesh           | SphereGeometry + ShaderMaterial | 1 |
| `radiation/`        | RadiationModule, RadiationMesh, AlertThresholds | InstancedMesh (puntos) o Heatmap | 1 |
| **Total**           |                                  |                         | **7–8**    |

> El total de draw calls se mantiene dentro del presupuesto de **≤ 8 por frame** (RNF-02).

---

### 5.4 `frontend/src/workers/` — Web Workers

| Archivo                   | Worker # | Responsabilidad                                                                    |
| ------------------------- | :------: | ---------------------------------------------------------------------------------- |
| `ingestion.worker.ts`     | W1       | Parseo de CSV/GeoJSON de incendios y sismos. Conversión geodésica→cartesiana $(lat, lon) → (X, Y, Z)$. Escalado de FRP a color/tamaño. Normalización de CPM→µSv/h para radiación. Empaquetado en `Float32Array`. |
| `spatial.worker.ts`       | W2       | Construcción del Octree 3D con eventos sísmicos. Consultas de proximidad (sismos cerca de ciudades, agrupación por placas). |
| `wind.worker.ts`          | W3       | Decodificación de rejilla de viento $(U, V)$ desde JSON/FlatBuffers. Cálculo de magnitudes $\sqrt{U^2+V^2}$ y direcciones $\text{atan2}(V,U)$. Generación del array RGBA para `DataTexture`. |
| `worker.types.ts`         | —        | Interfaces de mensajes: `FiresReadyMessage`, `QuakesReadyMessage`, `WindReadyMessage`, `RadiationReadyMessage`. Enums de tipos de mensaje. |

Todos los workers exponen su API vía **Comlink** y transfieren datos al hilo principal mediante **Transferable Objects** (zero-copy).

---

### 5.5 `frontend/src/components/` — HUD React

| Directorio / Archivo     | Descripción                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ |
| `App.tsx`                | Componente raíz. Monta el `HUDLayout` como overlay absoluto sobre el canvas.   |
| `hud/HUDLayout.tsx`      | Grid CSS del HUD: sidebar izquierda (controles), barra inferior (time-scrubber), esquina superior derecha (status). |
| `hud/LayerControls.tsx`  | 5 toggles: Fuego 🔥, Viento 🌬️, Sismos 🌍, Inundación 🌊, Radiación ☢️. Muta `state.layers` vía Valtio. |
| `hud/TimeScrubber.tsx`   | Selector de rango temporal: 24h / 7d / 30d. Muta `state.filters.timeRange`. Dispara re-filtrado en workers. |
| `hud/SeaLevelSlider.tsx` | Slider `+0m` a `+10m`. Muta `state.seaLevel`. Three.js lee el valor directamente para el uniform. |
| `hud/StatusIndicator.tsx`| Badge de estado por módulo: `LIVE` (verde), `CACHÉ` (amarillo), `RESGUARDO` (rojo). Lee `state.connectionStatus`. |
| `panels/TelemetryPanel.tsx` | Panel flotante que aparece al hacer clic en un objeto. Renderiza el subpanel correspondiente según `state.selectedObject.type`. |
| `panels/FireDetail.tsx`  | Muestra: coordenadas, FRP ($\text{MW/km}^2$), brightness (K), instrumento, confianza. |
| `panels/QuakeDetail.tsx` | Muestra: coordenadas, magnitud, profundidad (km), lugar, timestamp.            |
| `panels/WindDetail.tsx`  | Muestra: coordenadas, velocidad (nudos), dirección (°), componentes $(U, V)$.  |
| `panels/RadiationDetail.tsx` | Muestra: coordenadas, valor ($\mu\text{Sv/h}$), valor raw, unidad raw, station_id, nivel de alerta. |
| `common/Badge.tsx`       | Badge reutilizable con variantes: `normal` (verde), `warning` (amarillo), `critical` (rojo parpadeante). |
| `common/Toggle.tsx`      | Switch on/off estilizado con Tailwind. Recibe `checked` y `onChange`.           |
| `common/Slider.tsx`      | Slider numérico con label y valor actual. Recibe `min`, `max`, `step`, `value`, `onChange`. |

---

### 5.6 `frontend/src/store/` — Estado Valtio

| Archivo           | Contenido                                                                     |
| ----------------- | ----------------------------------------------------------------------------- |
| `index.ts`        | `export const state = proxy<GaiaState>({...})` — Crea y exporta el estado global. |
| `state.types.ts`  | Interfaces: `GaiaState`, `LayerVisibility`, `TimeFilter`, `SelectedObject`, `ConnectionStatus`, `FloodState`. |
| `actions.ts`      | Funciones de mutación: `toggleLayer()`, `setTimeFilter()`, `setSeaLevel()`, `selectObject()`, `clearSelection()`, `setConnectionStatus()`. |
| `hooks.ts`        | Hooks React que usan `useSnapshot()`: `useGaiaState()`, `useLayerVisibility()`, `useSelectedObject()`, `useConnectionStatus()`. |

---

### 5.7 `frontend/src/services/` — Capa de Servicios

| Archivo                 | Endpoint                    | Retorna                  |
| ----------------------- | --------------------------- | ------------------------ |
| `api.ts`                | —                           | `fetchAPI<T>(url)` — wrapper genérico con manejo del contrato `{ success, data, error }` |
| `fires.service.ts`      | `GET /api/fires`            | `FireHotspot[]`          |
| `quakes.service.ts`     | `GET /api/quakes`           | `Earthquake[]`           |
| `wind.service.ts`       | `GET /api/wind`             | `WindGridMeta`           |
| `radiation.service.ts`  | `GET /api/radiation`        | `RadiationReading[]`     |
| `elevation.service.ts`  | `GET /api/elevation`        | `{ elevation_m: number }` |

---

### 5.8 `backend/app/routers/` — Endpoints FastAPI

| Archivo          | Ruta              | Método | Descripción                                            |
| ---------------- | ----------------- | :----: | ------------------------------------------------------ |
| `fires.py`       | `/api/fires`      | GET    | Proxy NASA FIRMS. Params: `hours` (1–72).              |
| `quakes.py`      | `/api/quakes`     | GET    | Proxy USGS. Params: `days` (1–30), `min_magnitude`.    |
| `wind.py`        | `/api/wind`       | GET    | Proxy Open-Meteo. Params: `resolution`.                |
| `radiation.py`   | `/api/radiation`  | GET    | Proxy Safecast/EURDEP. Params: `lat`, `lon`, `radius_km`. |
| `elevation.py`   | `/api/elevation`  | GET    | Proxy Open-Meteo Elevation. Params: `lat`, `lon`.      |
| `history.py`     | `/api/history/{modulo}` | GET | Históricos desde PostgreSQL 18. Params: `from`, `to`. |
| `health.py`      | `/health`         | GET    | Estado del servidor, Redis, PostgreSQL y conectividad a APIs. |

Todos retornan el [formato de contrato universal](./GAIA_API_CONTRACT.md): `{ success, data, error }`.

---

### 5.9 `backend/app/services/` — Clientes de APIs Externas

| Archivo                    | API Externa       | Operación                                                    |
| -------------------------- | ----------------- | ------------------------------------------------------------ |
| `firms_client.py`          | NASA FIRMS        | Fetch asíncrono de anomalías térmicas (VIIRS/MODIS). Acepta `MAP_KEY`. |
| `usgs_client.py`           | USGS Earthquake   | Fetch de feeds GeoJSON precompilados (por magnitud y rango temporal). |
| `openmeteo_client.py`      | Open-Meteo        | Fetch de viento (U,V) y elevación puntual. Sin API Key.      |
| `safecast_client.py`       | Safecast          | Fetch de mediciones radiológicas por lat/lon/distancia. Sin API Key. |
| `eurdep_client.py`         | EURDEP / JRC      | Fetch de dosis radiológicas europeas. Sin API Key.            |
| `radiation_normalizer.py`  | —                 | Conversión de unidades: `CPM / 334 → µSv/h`, `nSv/h / 1000 → µSv/h`. |
| `http_client.py`           | —                 | `httpx.AsyncClient` singleton con timeout de 5s, 3 reintentos y headers comunes. |

---

### 5.10 `backend/app/cache/` — Redis

| Archivo           | Contenido                                                                     |
| ----------------- | ----------------------------------------------------------------------------- |
| `redis_client.py` | Conexión singleton a Redis usando `aioredis`. Reconexión automática si se pierde la conexión. |
| `cache_keys.py`   | Constantes de claves y TTLs por módulo:                                       |

| Módulo     | Clave Patrón            | TTL      |
| ---------- | ----------------------- | :------: |
| Incendios  | `firms:{hours}h`        | 5 min    |
| Sismos     | `usgs:{days}d:{mag}`    | 1 min    |
| Viento     | `wind:{resolution}`     | 15 min   |
| Radiación  | `rad:{lat}:{lon}:{km}`  | 5 min    |
| Elevación  | `elev:{lat}:{lon}`      | 24 h     |

---

### 5.11 `backend/tests/` — Tests del Backend

| Archivo              | Qué verifica                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `conftest.py`        | Fixtures: `TestClient` de FastAPI, mock de Redis (fakeredis), mock de httpx.  |
| `test_fires.py`      | Endpoint `/api/fires`: respuesta exitosa, caché hit, fallback local.          |
| `test_quakes.py`     | Endpoint `/api/quakes`: respuesta exitosa, validación de params, fallback.    |
| `test_wind.py`       | Endpoint `/api/wind`: respuesta exitosa, formato de rejilla.                  |
| `test_radiation.py`  | Endpoint `/api/radiation`: normalización CPM→µSv/h, umbrales de alerta.      |
| `test_elevation.py`  | Endpoint `/api/elevation`: respuesta con metros, caché de 24h.               |
| `test_contract.py`   | Verifica que **toda** respuesta del backend cumple `{ success, data, error }`. |
| `test_fallback.py`   | Simula fallo de API externa (timeout/5xx) → verifica cadena Redis → Local.    |
| `test_history.py`    | Endpoints `/api/history/*`: paginación, dedup por clave, retención.             |

---

### 5.12 `backend/app/db/` — Persistencia (PostgreSQL 18 + TimescaleDB)

La DB es el **archivo histórico** de GAIA ([GAIA_DATABASE](./GAIA_DATABASE.md)): persiste los snapshots ingeridos para servir rangos pasados que las APIs externas ya no ofrecen, además del registro de sesiones anonimizadas.

| Archivo               | Responsabilidad                                                                 |
| --------------------- | ------------------------------------------------------------------------------- |
| `database.py`         | `create_async_engine(DATABASE_URL)` + sesión SQLAlchemy asíncrona (asyncpg).    |
| `models.py`           | ORM: `FireHotspot`, `Earthquake`, `WindFrame`, `RadiationReading`, `ElevationSample`, `SessionEvent`. |
| `ingest.py`           | Jobs periódicos: upsert con dedup (`ON CONFLICT ... DO NOTHING`) al persistir datos ya ingeridos en caliente. |
| `queries.py`          | Consultas paginadas por rango temporal (`/api/history/*`), muestreo para volúmenes altos. |
| `session_store.py`    | Registro de sesiones anonimizadas: **hash** SHA-256 de la cookie, nunca el valor crudo (privacidad). |

Mapeo por tabla: hipertabla por tiempo para datos de eventos; TTL físico vía retención de TimescaleDB por módulo.

---

## 6. Convenciones de Nomenclatura

| Elemento                 | Convención                     | Ejemplo                         |
| ------------------------ | ------------------------------ | ------------------------------- |
| Archivos TypeScript      | `PascalCase.ts` (clases/componentes) | `FireModule.ts`, `App.tsx`     |
| Archivos utilitarios     | `camelCase.ts`                 | `coordinates.ts`, `colorScales.ts` |
| Archivos de tipos        | `kebab.types.ts`               | `fire.types.ts`, `api.types.ts` |
| Archivos de servicios    | `kebab.service.ts`             | `fires.service.ts`              |
| Workers                  | `kebab.worker.ts`              | `ingestion.worker.ts`           |
| Shaders GLSL             | `kebab.vert` / `kebab.frag`   | `atmosphere.frag`               |
| Archivos Python          | `snake_case.py`                | `firms_client.py`, `cache_keys.py` |
| Endpoints FastAPI        | `/api/kebab-plural`            | `/api/fires`, `/api/radiation`  |
| Variables de entorno     | `UPPER_SNAKE_CASE`             | `REDIS_URL`, `DATABASE_URL`, `FIRMS_MAP_KEY` |

---

## 7. Dependencias Principales

### 7.1 Frontend (`package.json`)

| Dependencia       | Rol                                           |
| ----------------- | --------------------------------------------- |
| `three`           | Motor de renderizado WebGL 2.0                |
| `react`           | Interfaz del HUD (DOM overlay)                |
| `react-dom`       | Renderizado de React en el DOM                |
| `valtio`          | Estado global reactivo (Proxy-based)          |
| `comlink`         | Comunicación tipada Main ↔ Workers            |
| `tailwindcss`     | Framework CSS utilitario                      |
| `typescript`      | Compilador TypeScript                         |
| `webpack`         | Bundler principal                             |
| `webpack-cli`     | CLI de Webpack                                |
| `webpack-dev-server` | Servidor de desarrollo con HMR             |
| `ts-loader`       | Carga de archivos TypeScript en Webpack       |
| `css-loader`      | Carga de CSS en Webpack                       |
| `postcss-loader`  | Procesamiento PostCSS (Tailwind)              |
| `html-webpack-plugin` | Generación del HTML de salida             |
| `stats.js`        | Monitor de FPS en desarrollo (opcional)       |

### 7.2 Backend (`requirements.txt`)

| Dependencia       | Rol                                           |
| ----------------- | --------------------------------------------- |
| `fastapi`         | Framework web asíncrono                       |
| `uvicorn[standard]` | Servidor ASGI de alto rendimiento           |
| `pydantic`        | Validación de datos y modelos de respuesta    |
| `httpx`           | Cliente HTTP asíncrono (fetch a APIs externas)|
| `aioredis`        | Cliente Redis asíncrono                       |
| `numpy`           | Procesamiento de matrices (viento GRIB2)      |
| `shapely`         | Operaciones geométricas espaciales            |
| `geopandas`       | Análisis geoespacial sobre DataFrames         |
| `python-dotenv`   | Carga de variables de entorno desde `.env`    |
| `pytest`          | Framework de testing                          |
| `pytest-asyncio`  | Soporte async para tests                      |
| `fakeredis`       | Mock de Redis para tests                      |
| `sqlalchemy[asyncio]` | ORM asíncrono (asyncpg) para la DB de históricos |
| `asyncpg`         | Driver PostgreSQL 18 (pool async)             |
| `alembic`         | Migraciones de esquema de la DB               |

---

*Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md), el [Stack Tecnológico](./GAIA_TECH_STACK.md), el [Estado Global](./GAIA_STATE.md) y la [Guía de Despliegue](./GAIA_DEPLOYMENT.md) del proyecto GAIA.*

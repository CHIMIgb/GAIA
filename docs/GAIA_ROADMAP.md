# GAIA — Roadmap de Desarrollo

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.1  
> **Fecha:** 2026-09-22  

---

## 1. Introducción y Método

Este roadmap descompone el desarrollo de GAIA en **16 fases incrementales**, cada una dividida en **pasos pequeños e independientemente verificables**. Cada fase entrega **valor visible y testeable** antes de avanzar a la siguiente (estrategia de incrementos verticales, no capas horizontales aisladas).

> [!NOTE]
> Este documento es el **complemento ejecutivo** del resto de la documentación: hereda todos los detalles numéricos, de archivos, de endpoints y de infraestructura ya definidos en la [Especificación Técnica](./GAIA_SPECIFICATION.md), el [Stack Tecnológico](./GAIA_TECH_STACK.md), el [Contrato de API](./GAIA_API_CONTRACT.md), los [Workflows](./GAIA_WORKFLOWS.md), el [Catálogo de APIs](./GAIA_DATA_SOURCES.md), las [Texturas del Globo](./GAIA_GLOBE_TEXTURES.md), la [Estructura del Proyecto](./GAIA_PROJECT_STRUCTURE.md), el [Estado Global](./GAIA_STATE.md), el [Plan de Testing](./GAIA_TESTING.md), la [Guía de Despliegue](./GAIA_DEPLOYMENT.md), la [Seguridad](./GAIA_SECURITY.md) y la [Base de Datos](./GAIA_DATABASE.md). Cuando un paso cita «según [Doc §x]», ese documento es la fuente de verdad.

### 1.1 Reglas de Ejecución

1. **Un paso = un commit.** Cada paso termina con código compilando, lint limpio y—cuando aplica—tests verdes.
2. **Testing continuo.** Cada fase incluye sus tests; nunca se acumula deuda de verificación "para el final".
3. **Backend primero, frontend en paralelo cuando hay contrato.** El contrato universal `{ success, data, error }` y los endpoints se definen temprano (Fase 1) para que el frontend siempre consuma una API estable.
4. **Los shaders/modules siguen un patrón común** (`IGaiaModule` de [Estructura §5.3](./GAIA_PROJECT_STRUCTURE.md)): cada módulo 3D se añade como un incremento autónomo reutilizando ese patrón.
5. **Branching**: `main` siempre estable; se trabaja por feature-branch (`feat/fase-x-paso-y`) + PR con los checks de CI.
6. **Definición de Hecho (DoD)** global: compila (`tsc --noEmit` strict), lint OK, tests OK, draw calls ≤ 8, sin fugas VRAM tras toggle, y FCP < 2 s (medido).
7. **Ritmo de entrega**: los pasos 1–3 del [pipeline CI](./GAIA_TESTING.md#81-pipeline-ci-github-actions) se ejecutan en **cada PR**; los checks de rendimiento (4–6) en PRs a `main` o nightly; 7 (deploy) solo al mergear a `main`.

### 1.2 Mapa Global de Fases

| Fase | Nombre                                        | Duración (jornadas) | RF/RNF clave       | Entrega visible                        |
| :--: | --------------------------------------------- | :-----------------: | ------------------ | -------------------------------------- |
| 0    | Bootstrap y herramientas                      | 3                   | —                  | Repo, CI base, entorno dev             |
| 1    | Backend: contrato, Redis, endpoints base      | 6                   | RF-13 (parcial)    | API `{success,data,error}` + tests     |
| 2    | Base de datos (PostgreSQL 18) y sesiones      | 6                   | RNF-05, privacidad | Históricos persistidos + `/api/history/*` |
| 3    | Frontend: scaffold, store Valtio, servicios   | 5                   | RF-12 (parcial)    | HUD estático + estado + cliente API    |
| 4    | Motor 3D y globo terráqueo                    | 10                  | RF-01, RF-02       | Globo interactivo 60 FPS bypass        |
| 5    | Módulo incendios (NASA FIRMS)                 | 6                   | RF-03, RF-04       | Focos de fuego en el globo             |
| 6    | Módulo sismos (USGS)                          | 6                   | RF-07, RF-08       | Columnas + ondas de choque             |
| 7    | Módulo viento (Open-Meteo + GPU)              | 8                   | RF-05, RF-06       | Partículas de viento en GPU            |
| 8    | Módulo inundación (nivel del mar)             | 6                   | RF-09, RF-10       | Slider + mascarado costero             |
| 9    | Módulo radiación (Safecast y feeds)           | 6                   | RF-13, RF-14       | Sensores con umbrales y parpadeo       |
| 10   | HUD analítico, interacción y time-scrubber    | 6                   | RF-11, RF-12       | Telemetría al clic + filtros funcionales |
| 11   | Resiliencia end-to-end (fallback + workers)   | 4                   | RNF-03, RNF-05     | Modo resguardo en UI real              |
| 12   | Seguridad y privacidad (hardening)            | 4                   | RNF-07, privacidad | Headers, rate-limit, sesiones, CSP     |
| 13   | Optimización 60 FPS y memoria GPU             | 8                   | RNF-01, RNF-02, RNF-04 | 60 FPS con 20k datos, ≤ 8 draw calls |
| 14   | Testing integral, compatibilidad, CI/CD       | 6                   | RNF-06, RNF-07     | Lighthouse ≤ presupuestos + navegadores |
| 15   | Despliegue, monitoreo y operaciones           | 5                   | —                  | Producción + `/health` + alertas       |
| 16   | Pulido final, docs y demostración             | 3                   | —                  | README, demo, licencia                 |
|      | **Total**                                     | **~92**             |                    |                                        |

---

## 2. FASE 0 — Bootstrap y Herramientas

> **Objetivo:** Repositorio, tooling, convenciones y primer pipeline CI con un "hola mundo" que compila y testea.
> **Duración:** 3 jornadas. **Depende de:** nada. **RF/RNF:** ninguna (habilitadora).

### Pasos

**Paso 0.1 — Esqueleto del monorepo**
- [ ] Crear estructura `frontend/`, `backend/`, `docs/`, `.env.example`, `.gitignore` ([Estructura §1](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `.gitignore`: `node_modules/`, `__pycache__/`, `.env`, `.env.local`, `dist/`, `build/`, `.venv/`, `*.pyc`, `*.lock` (generados), `coverage/`.
- [ ] Verificar `git status` limpio de artefactos.
- [ ] Instalar Node 22 LTS y Python 3.12 como runtimes objetivo ([Deployment §3.1 y §8.3](./GAIA_DEPLOYMENT.md)).

**Paso 0.2 — Frontend scaffold (TypeScript + Webpack 5)**
- [ ] `package.json` con dependencias y versiones **fijadas** de [Deployment §8.1](./GAIA_DEPLOYMENT.md): `three ^0.170.0`, `react ^19.0.0`, `react-dom ^19.0.0`, `valtio ^1.13.2`, `comlink ^4.4.1`, `tailwindcss ^3.4.10`, `typescript ^5.6.2`, `webpack ^5.94.0`, `webpack-cli`, `webpack-dev-server`, `ts-loader`, `css-loader`, `postcss-loader`, `html-webpack-plugin`, `stats.js`.
- [ ] `tsconfig.json` (strict, paths), `tailwind.config.js` (tema oscuro), `postcss.config.js` (autoprefixer + tailwind), `.eslintrc.js` (TS + React, incluye regla `react/no-danger` de [Seguridad §6.1](./GAIA_SECURITY.md)).
- [ ] **Split de config Webpack 5**: `webpack.config.js` (base, regla `asset/source` para `.vert/.frag/.glsl` y `new Worker(new URL(...))`), `webpack.dev.js` (devServer + HMR + source maps), `webpack.prod.js` (tree-shaking, `SplitChunksPlugin`, `moduleIds: 'deterministic'`, source maps de prod) ([Deployment §5.1](./GAIA_DEPLOYMENT.md)).
- [ ] `env.d.ts` con declaraciones de módulos `*.vert` / `*.frag` / `*.glsl` para TypeScript ([Estructura §2](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `public/index.html` + `favicon.ico` + montado de `<canvas>` y `#root`.
- [ ] **Criterio**: `npm run dev` abre una página en `:8080`; `npm run build` produce `dist/`.

**Paso 0.3 — Backend scaffold (FastAPI)**
- [ ] `backend/` con `requirements.txt` (versiones de [Deployment §8.2](./GAIA_DEPLOYMENT.md)) + `sqlalchemy[asyncio]`, `asyncpg`, `alembic`; `pyproject.toml` ([Estructura §3](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `app/main.py` con Uvicorn, middleware CORS **allowlist** (`CORS_ORIGINS`, nunca `*` en producción, [Seguridad §5.2](./GAIA_SECURITY.md)) y handler global de errores → contrato universal.
- [ ] `app/config.py` (Pydantic Settings) con las variables de [Deployment §4.1](./GAIA_DEPLOYMENT.md) (`REDIS_URL`, `DATABASE_URL`, `FIRMS_MAP_KEY`, `CORS_ORIGINS`, `DEBUG`, `LOG_LEVEL`, `PORT`, `PUBLIC_FRONTEND_URL`, TTLs `TTL_FIRES_SECONDS`, `TTL_QUAKES_SECONDS`, `TTL_WIND_SECONDS`, `TTL_RADIATION_SECONDS`, `TTL_ELEVATION_SECONDS`).
- [ ] `backend/app/fallback/` con los datasets de muestra (firms, quakes, wind_grid, radiation).
- [ ] **Criterio**: `uvicorn app.main:app` escucha en `:8000` y responde `/health` en formato contrato.

**Paso 0.4 — Docker Compose base + entornos**
- [ ] `docker-compose.yml` de [Deployment §5.3](./GAIA_DEPLOYMENT.md): `redis:7-alpine --appendonly` (+ volumen `redis-data`), `timescale/timescaledb:latest-pg18` (+ `postgres-data`), `backend` (Dockerfile con `python:3.12-slim`, `pip install --no-cache-dir`, `CMD uvicorn --host 0.0.0.0 --port 8000`).
- [ ] `Dockerfile` del backend con tags **pinneados** y volumen dedicado para PostgreSQL ([Seguridad §8](./GAIA_SECURITY.md)).
- [ ] `.env.example` raíz y del backend con la plantilla exacta de [Deployment §4.4](./GAIA_DEPLOYMENT.md).
- [ ] **Criterio**: `docker compose up` levanta Redis, BD y FastAPI; `/health` responde `redis: connected`.

**Paso 0.5 — CI base y convenciones**
- [ ] `.github/workflows/ci.yml`: lint + `tsc --noEmit` en frontend; `pytest` en backend (aún sin tests reales, verificar que corre vacío) con Node 22 y Python 3.12 ([Deployment §6.3](./GAIA_DEPLOYMENT.md)).
- [ ] Scripts npm: `dev`, `build`, `lint`, `test`, `typecheck`, `perf:check` (size-limit) y `lighthouse:ci` ([Testing §8.1](./GAIA_TESTING.md)).
- [ ] **Instrumentar `performance.mark('gaia:boot')`** en `main.ts` desde el día 1 (para medir FCP/globo-ready en Fase 14, [Testing §3.2](./GAIA_TESTING.md)).
- [ ] Documentar convenciones de nomenclatura de [Estructura §6](./GAIA_PROJECT_STRUCTURE.md) (PascalCase/camelCase/kebab/snake, `/api/kebab-plural`, `UPPER_SNAKE_CASE`).
- [ ] **Criterio**: push a `main` dispara CI en verde.

---

## 3. FASE 1 — Backend: Contrato Universal, Redis y Endpoints Base

> **Objetivo:** Capa de proxy FastAPI funcional con caching Redis, fallback y endpoints de datos, todo bajo el contrato universal.
> **Duración:** 6 jornadas. **Depende de:** Fase 0. **RF/RNF:** RF-13 (normalización base), RNF-05 (backend), RNF-06 (caché).

### Pasos

**Paso 1.1 — Modelos Pydantic y contrato (backend)**
- [ ] `app/models/response.py`: `APIError`, `APIResponse` con helpers `ok()`/`fail()` (espejo de [API Contract §5.1](./GAIA_API_CONTRACT.md)).
- [ ] `app/models/{fire,quake,wind,radiation,elevation}.py` con los schemas de [Contrato §4](./GAIA_API_CONTRACT.md) y los rangos de validación de [Estructura §5.8](./GAIA_PROJECT_STRUCTURE.md) (`hours` 1–72, `days` 1–30, `min_magnitude`, `radius_km`, `resolution`, `lat`/`lon`).
- [ ] **Middleware global de errores** de [Contrato §5.2](./GAIA_API_CONTRACT.md) (500 capturado → `INTERNAL_SERVER_ERROR`).
- [ ] **Implementar el catálogo de códigos** de [Contrato §6](./GAIA_API_CONTRACT.md): `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `UPSTREAM_UNAVAILABLE` (502), `UPSTREAM_RATE_LIMITED` (429), `UPSTREAM_TIMEOUT` (504), `CACHE_MISS` (503), `INTERNAL_SERVER_ERROR` (500).
- [ ] `app/services/http_client.py`: `httpx.AsyncClient` singleton, timeout 5 s, 3 reintentos ([Seguridad §5.3](./GAIA_SECURITY.md) / [Estructura §5.9](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] **Criterio**: `test_contract.py` pasa: cualquier endpoint devuelve `{success,data,error}` y los 7 códigos de error se disparan en sus fixtures.

**Paso 1.2 — Redis client y claves de caché**
- [ ] `app/cache/redis_client.py` (aioredis 2.0.1 o `redis>=5` async, singleton con reconexión; nota mantenimiento de [Deployment §8.2](./GAIA_DEPLOYMENT.md)).
- [ ] `app/cache/cache_keys.py`: claves y TTLs de [Deployment §4.2](./GAIA_DEPLOYMENT.md) — `firms:{hours}h` (300 s), `usgs:{days}d:{mag}` (60 s), `wind:{resolution}` (900 s), `rad:{lat}:{lon}:{km}` (300 s), `elev:{lat}:{lon}` (86400 s) — además de `history:{module}:{range}` para históricos (TTL corto, [GAIA_DATABASE §7](./GAIA_DATABASE.md)).
- [ ] **Criterio**: `test_fires.py` con caché hit comprueba que la 2.ª petición no golpea el mock de la API externa (fixtures `fakeredis` + mock de `httpx` de [Testing §5.1](./GAIA_TESTING.md)).

**Paso 1.3 — Cliente NASA FIRMS + endpoint `/api/fires`**
- [ ] `app/services/firms_client.py`: fetch async a `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/{INSTRUMENT}/world/{hours}` ([Catálogo §1.1](./GAIA_DATA_SOURCES.md)).
- [ ] Soportar los 4 instrumentos: `VIIRS_SNPP_NRT`, `VIIRS_NOAA20_NRT`, `VIIRS_NOAA21_NRT`, `MODIS_NRT` (config por query param).
- [ ] `app/routers/fires.py`: validación `hours` (1–72), caché Redis → API externa → fallback local.
- [ ] **Criterio**: `curl /api/fires?hours=24` → `{success:true, data:{count, items:[...]}}`; sin `MAP_KEY` responde `fallback:true` con `fallback/firms_latest.json`.

**Paso 1.4 — Cliente USGS + endpoint `/api/quakes`**
- [ ] `app/services/usgs_client.py`: feeds precompilados de [Catálogo §2.1](./GAIA_DATA_SOURCES.md) según `days` (`2.5_day`, `4.5_week`, `4.5_month`) y endpoint `query` con `starttime`/`minmagnitude` como alternativa.
- [ ] Extraer por evento: `mag`, `place`, `time`, `depth`, `tsunami`, `sig`, `type`, coordenadas `[lon, lat, depth]`.
- [ ] `app/routers/quakes.py`: params `days` (1–30), `min_magnitude`; caché `usgs:...`.
- [ ] **Criterio**: `/api/quakes?days=7&min_magnitude=4.0` válido; `days=400` → `VALIDATION_ERROR` (400).

**Paso 1.5 — Clientes Open-Meteo (viento + elevación)**
- [ ] `app/services/openmeteo_client.py`: rejilla de viento con `hourly=wind_speed_10m,wind_direction_10m,wind_speed_80m,wind_direction_80m,windspeed_100hPa,winddirection_100hPa&format=flatbuffers` ([Catálogo §3.1](./GAIA_DATA_SOURCES.md)) y elevación puntual ([Texturas §3.1](./GAIA_GLOBE_TEXTURES.md)).
- [ ] **Convertir speed/dir → componentes U/V**: `U = speed·cos(dir)`, `V = speed·sin(dir)` antes de cachear (para entregar la rejilla de vectores que espera el Worker 3).
- [ ] `app/routers/wind.py` (`/api/wind`) y `app/routers/elevation.py` (`/api/elevation`) con caché (`wind:{res}` 15 min, `elev:{lat}:{lon}` 24 h).
- [ ] **Criterio**: `/api/elevation?lat=27.99&lon=86.93` devuelve `{elevation_m: 8747}` (aprox., tipo prototipo); `/api/wind` devuelve metadata + ArrayBuffer/base64 de la rejilla.

**Paso 1.6 — Clientes radiológicos + normalización µSv/h (4 fuentes)**
- [ ] `app/services/{safecast,eurdep,radnet,gmcmap}_client.py` para las **4 fuentes del RF-13** ([Catálogo §6](./GAIA_DATA_SOURCES.md)): Safecast (`measurements.json?latitude=..&longitude=..&distance=..`), EURDEP/JRC REMON (GeoJSON/WFS), EPA RadNet (Envirofacts JSON) y GMCMap (CPM nativo con ID de query público).
- [ ] `app/services/radiation_normalizer.py` con la tabla de [Workflows §8](./GAIA_WORKFLOWS.md): `if CPM: value/334.0` (Cs-137/GQ), `if nSv/h: value/1000.0`, `if uSv/h: value`, desconocido → `ValueError`.
- [ ] `app/routers/radiation.py`: params `lat`, `lon`, `radius_km`; fusión por estación/hora; caché `rad:...` (5 min).
- [ ] **Criterio**: `test_radiation.py` de [Testing §6.1](./GAIA_TESTING.md) verifica los 4 casos: `42 CPM → 42/334`, `1.25 uSv/h → 1.25`, `1000 nSv/h → 1.0`, `5 mSv/h → error`.

**Paso 1.7 — /health completo y middleware de errores**
- [ ] `app/routers/health.py`: estado servidor + Redis + PostgreSQL (`SELECT 1`) + conectividad por módulo (`firms`, `usgs`, `open_meteo`, `radiation`) con `status: ok|degraded` y `last_cache.hit_rate`, formato de [Deployment §7.1](./GAIA_DEPLOYMENT.md).
- [ ] Exception handler global envolviendo todo en contrato.
- [ ] **Criterio**: `test_contract.py` + `test_fallback.py` en verde (cadena Redis → API → local, con flags `cached: true | fallback: true`).

**Paso 1.8 (Opcional) — Rutas pesadas de viento (NOAA GFS)**
- [ ] `app/services/gfs_client.py`: descargar GRIB2 de NOAA GFS (`s3://noaa-gfs-bdp-pds`, 0.25°), **recortar y servir solo los ArrayBuffers de viento** con `numpy`/`cfgrib`/`xarray` en backend (los archivos pesan 50–200 MB, [Catálogo §3.2](./GAIA_DATA_SOURCES.md)).
- [ ] Activar como **Prioridad 2** del fallback de viento (tras Open-Meteo).
- [ ] **Criterio**: el `wind_grid_latest.bin` de resguardo se sirve con el mismo formato de rejilla que Open-Meteo.

**Paso 1.9 (Opcional) — Enriquecimiento geoespacial (Shapely/GeoPandas)**
- [ ] `app/services/geo_enrichment.py`: país/región por coordenada (`ne_110m_countries`), intersección con áreas protegidas y proximidad a centros urbanos para sismos ([Tech Stack §2.7](./GAIA_TECH_STACK.md)).
- [ ] **Criterio**: cada hotspot/sismo del payload lleva `country_code` opcional para el HUD y la DB (`country_code` sin IP, [GAIA_DATABASE §3.1](./GAIA_DATABASE.md)).

> **DoD Fase 1:** Todos los endpoints `/api/*` responden contrato universal; caché Redis operativa; 4 fuentes de radiación normalizadas a µSv/h; fallback local probado por pytest; CI en verde.

---

## 4. FASE 2 — Base de Datos (PostgreSQL 18 + TimescaleDB) y Sesiones

> **Objetivo:** Persistencia de históricos, migraciones Alembic y registro de sesiones anonimizadas según [GAIA_DATABASE](./GAIA_DATABASE.md).
> **Duración:** 6 jornadas. **Depende de:** Fase 1. **RF/RNF:** RNF-05, privacidad (§8 GAIA_DATABASE).

### Pasos

**Paso 2.1 — Conexión SQLAlchemy async**
- [ ] `backend/app/db/database.py`: `create_async_engine(DATABASE_URL)` con `asyncpg` + `sessionmaker`, hook de lifespan en FastAPI ([Estructura §5.12](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] Health check integra `SELECT 1` → `postgres: connected`.
- [ ] **Criterio**: arranque sin DB no crashea (sin-históricos); con DB, `/health` reporta `pg: connected`.

**Paso 2.2 — Modelos ORM + migraciones Alembic**
- [ ] `app/db/models.py`: `FireHotspot`, `Earthquake`, `WindFrame`, `RadiationReading`, `ElevationSample`, `SessionEvent` y `DataIngestionLog` con el esquema exacto del DDL de [GAIA_DATABASE §3.2](./GAIA_DATABASE.md) (hipertabla `fire_hotspot`, `UNIQUE` de dedup por tabla, `data_ingestion_log(module, source, status ok|fallback|error, rows)`).
- [ ] `alembic/` con revisión inicial: `create_hypertable('fire_hotspot', 'sensor_ts', migrate_data => true)` y análogas; índices `(lat, lon)` GIST y partición temporal ([GAIA_DATABASE §7](./GAIA_DATABASE.md)).
- [ ] **Criterio**: `alembic upgrade head` aplica en local y en CI contra una BD limpia.

**Paso 2.3 — Ingesta con dedup**
- [ ] `app/db/ingest.py`: `ON CONFLICT ... DO NOTHING` por clave de dedup ([GAIA_DATABASE §3.1](./GAIA_DATABASE.md)): `(sensor_ts,lat,lon,instrument)`; `usgs_event_id`; `(station_id,sampled_at)`; `(lat,lon)`.
- [ ] **Frecuencia = TTLs de Redis**: incendios y radiación 5 min; sismos 1 min; viento 15 min ([GAIA_DATABASE §4.1](./GAIA_DATABASE.md)). Se persiste lo ya ingerido en caliente, sin peticiones extras a las APIs.
- [ ] Cada job escribe en `data_ingestion_log` (auditoría + fuente para `/health`).
- [ ] **Criterio**: `test_history.py` verifica que re-persistir el mismo evento no duplica filas (idempotencia).

**Paso 2.4 — API de históricos `/api/history/*`**
- [ ] `app/routers/history.py`: endpoints de [GAIA_DATABASE §5](./GAIA_DATABASE.md) con paginación `OFFSET/LIMIT` (`time DESC`), muestreo a **máx. 20,000 puntos por respuesta** (agrupado por hora en rangos amplios) y `bbox` para radiación.
- [ ] `app/db/queries.py`: consultas por rango temporal; cachear respuestas repetidas en Redis (`history:{module}:{range}`, TTL corto, [GAIA_DATABASE §7](./GAIA_DATABASE.md)).
- [ ] **Orquestación por ventana**: rango reciente (dentro de TTLs) → Redis; más allá → DB (latencia < 20 ms en caliente, [GAIA_DATABASE §5](./GAIA_DATABASE.md)).
- [ ] **Criterio**: `/api/history/fires?from=X&to=Y` responde contrato; rangos amplios muestreados sin exceder 20k.

**Paso 2.5 — Sesiones anonimizadas (privacidad)**
- [ ] `app/db/session_store.py`: `session_key = sha256(cookie)` — **nunca la cookie cruda ni IP** ([GAIA_DATABASE §8.4](./GAIA_DATABASE.md)).
- [ ] `touch_session()`: upsert con `first_seen`, `last_seen`, `request_count + 1`; campos opcionales `user_agent_family`, `country_code` (sin IP, [GAIA_DATABASE §3.1](./GAIA_DATABASE.md)).
- [ ] Dependencia FastAPI que lee `gaia_session` (reglas de [Seguridad §3](./GAIA_SECURITY.md)) y actualiza la sesión en cada `/api/*`.
- [ ] Job de purga diaria: borrar `session_events` con `last_seen < now() - 60d` (ventana 30–90 días, [GAIA_DATABASE §8.4](./GAIA_DATABASE.md)).
- [ ] **Criterio**: 3 peticiones con la misma cookie → 1 fila con `request_count = 3` y **ningún** valor crudo persistido ni logueado.

**Paso 2.6 — Retención física y backups**
- [ ] `add_retention_policy` por hipertabla con los valores de [GAIA_DATABASE §4.2](./GAIA_DATABASE.md): `fire_hotspot` 90 días, `earthquake` 365, `radiation_reading` 90, `wind_frame` 30, `elevation_sample` 365. Variables `HISTORY_RETENTION_*` configurables ([GAIA_DATABASE §6.4](./GAIA_DATABASE.md)).
- [ ] WAL archiving + `pg_dump` diario (cron); script de restauración con RPO ≤ 24 h / RTO ≤ 1 h ([GAIA_DATABASE §6.2](./GAIA_DATABASE.md)).
- [ ] **Criterio**: `test_history.py` incluye verificación de retención (datos viejos expulsados por `drop_chunks`).

> **DoD Fase 2:** Históricos persistiendo y consultables; sesiones registradas sin PII; retención/bacaups operativos; tests en CI.

---

## 5. FASE 3 — Frontend: Scaffold, Store Valtio y Cliente API

> **Objetivo:** Base del frontend: caja React + Tailwind, estado global Valtio, servicios tipados, infraestructura de Workers y presupuesto de bundle.
> **Duración:** 5 jornadas. **Depende de:** Fase 1 (contrato). **RF/RNF:** RF-12 (parcial), RNF-06 (bundle), RNF-03 (arquitectura worker).

### Pasos

**Paso 3.1 — Estado global Valtio**
- [ ] `frontend/src/store/state.types.ts`: interfaces de [GAIA_STATE §2–3](./GAIA_STATE.md) (GaiaState, LayerVisibility, TimeFilter, SelectedObject, ConnectionStatus, FloodState, TelemetryPanel, PerformanceCounters, datos efímeros de módulo).
- [ ] `store/index.ts`: `proxy<GaiaState>({...})` con valores por defecto de [GAIA_STATE §2.3](./GAIA_STATE.md).
- [ ] **Criterio**: `tsc --noEmit` strict pasa sin `any`.

**Paso 3.2 — Acciones + hooks**
- [ ] `store/actions.ts`: `toggleLayer`, `setTimeFilter`, `setSeaLevel` (clamp 0–10), `selectObject`, `clearSelection`, `setConnectionStatus` ([GAIA_STATE §6](./GAIA_STATE.md)).
- [ ] `store/hooks.ts`: `useGaiaState`, `useLayerVisibility`, `useTimeFilter`, `useSelectedObject`, `useConnectionStatus`, `useFlood`, `usePerformance`.
- [ ] **Criterio**: `store/actions.spec.ts` (Vitest) de [Testing §6.2](./GAIA_TESTING.md) cubre clamp (`setSeaLevel(-3)→0`, `setSeaLevel(15)→10`), toggles, selección y connection status (assert sobre snapshot).

**Paso 3.3 — Tipos de dominio y cliente API**
- [ ] `frontend/src/types/*.types.ts` con los tipos de [Estructura §2](./GAIA_PROJECT_STRUCTURE.md): `FireHotspot`, `Earthquake`, `WindVector`, `RadiationReading`, `FloodState`, `TileCoord`, `ElevationData`, `worker.messages` (alineados con [Tech Stack §2.1](./GAIA_TECH_STACK.md), p.ej. `FireHotspot {lat, lon, brightness K, frp MW/km², instrument 'VIIRS'|'MODIS', confidence, acq_date}`).
- [ ] `services/api.ts`: `fetchAPI<T>()` que lanza `GaiaAPIError` si `!success` ([Contrato §5.3](./GAIA_API_CONTRACT.md)).
- [ ] `services/{fires,quakes,wind,radiation,elevation}.service.ts` con los endpoints de [Estructura §5.7](./GAIA_PROJECT_STRUCTURE.md).
- [ ] **Criterio**: tests con **msw** cubren éxito y error (`success:false` → `GaiaAPIError`), [Testing §6.2](./GAIA_TESTING.md).

**Paso 3.4 — Utilidades puras con tests**
- [ ] `utils/coordinates.ts` (`geodesicToCartesian`), `utils/terrarium.ts` (`decodeTerrarium`), `utils/colorScales.ts` (FRP → color, magnitud, µSv/h), `utils/tilemath.ts`, `utils/dispose.ts` (`disposeObject3D` recursivo).
- [ ] Tests Vitest de cada una (≥ 80 % cobertura en utils y `store/actions.ts`; **≥ 90 %** en `coordinates.ts`, [Testing §1](./GAIA_TESTING.md)).
- [ ] **Criterio**: coordenadas de ecuador/polos/sin valores correctos; terrarium: ceros, −100 m y picos.

**Paso 3.5 — Shell de React + Tailwind + status**
- [ ] `components/App.tsx` + `hud/HUDLayout.tsx`: sidebar (controles), bottom bar (time-scrubber), esquina superior (status), grid CSS de [Estructura §5.5](./GAIA_PROJECT_STRUCTURE.md).
- [ ] `components/common/{Badge,Toggle,Slider}.tsx` con tema oscuro (Badge variantes `normal|warning|critical`).
- [ ] `hud/StatusIndicator.tsx` leyendo `connectionStatus` (badges LIVE/CACHÉ/RESGUARDO, [Estructura §5.5](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] **Criterio**: HUD estático visible sobre un canvas falso; toggles escriben en `state.layers` y el badge responde.

**Paso 3.6 — Infraestructura de Workers + Comlink (W1/W2/W3)**
- [ ] `workers/worker.types.ts`: enums e interfaces de mensajes `FiresReadyMessage`, `QuakesReadyMessage`, `WindReadyMessage`, `RadiationReadyMessage`, `ProximityQueryMessage` y campos de buffer `Transferable` ([Estructura §5.4](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `workers/{ingestion,spatial,wind}.worker.ts` esqueleto con **API Comlink** (`wrap<IngestionWorker>(new Worker(...))`, [Tech Stack §2.6](./GAIA_TECH_STACK.md)) — la lógica se implementa en las fases de módulo (5/6/7).
- [ ] **Criterio**: `tests/workers/*.spec.ts` verifican mensajes `Transferable` y orden de campos (p.ej. `buffer.length % 7 === 0` para fuego, [Testing §6.3](./GAIA_TESTING.md)).

**Paso 3.7 — Presupuesto de bundle y code splitting (RNF-06)**
- [ ] `webpack.prod.js` con `SplitChunksPlugin`: chunk de arranque ≤ 180 KB, chunk Three.js ≤ 250 KB (bajo demanda), React + HUD ≤ 120 KB ([Deployment §5.1](./GAIA_DEPLOYMENT.md) / [Testing §3.4](./GAIA_TESTING.md)).
- [ ] El **globo base se dibuja desde el chunk principal**; los módulos pesados (viento/sismos) se cargan bajo demanda al activar la capa.
- [ ] `size-limit` configurado con **total JS inicial ≤ 450 KB gzip**.
- [ ] **Criterio**: `npm run perf:check` verde en CI (budget); FCP < 2.0 s en dev (verificación previa a Lighthouse de Fase 14).

> **DoD Fase 3:** Store + acciones cubiertos por tests, cliente API tipado, utilidades puras verificadas, infraestructura de workers lista, bundle bajo presupuesto.

---

## 6. FASE 4 — Motor 3D y Globo Terráqueo

> **Objetivo:** Ver el globo fotorrealista girando: esfera, atmósfera día/noche, elevación, textura satelital por LOD y cámara orbital.
> **Duración:** 10 jornadas. **Depende de:** Fase 3 (puede iniciarse en paralelo). **RF:** RF-01, RF-02. **RNF:** RNF-01, RNF-06, RNF-07.

### Pasos

**Paso 4.1 — Núcleo del Engine**
- [ ] `core/Engine.ts`: `WebGLRenderer`, `Scene`, `PerspectiveCamera`, `requestAnimationFrame` loop; llama `update(dt)` a cada módulo activo y `render()` ([Estructura §5.1](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `core/Clock.ts` (deltaTime, elapsed, FPS rolling de 60 frames), `core/Resizer.ts` (aspect + `devicePixelRatio` **cap 2.0**), `core/CameraController.ts` (OrbitControls + límites zoom + damping + auto-rotate inicial + restricción polar).
- [ ] Interface `IGaiaModule` (`init/update(dt)/setData(buffer)/setVisible/dispose`) ([Estructura §5.3](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `core/SceneManager.ts` con registro, ciclo de vida y garantía de `dispose()` al remover.
- [ ] `core/Stats.ts`: overlay `stats.js` + lectura de `renderer.info.render.calls/triangles` y `renderer.info.memory`.
- [ ] **Detección de capacidades (RNF-07)**: en `main.ts` verificar `canvas.getContext('webgl2')`; si falta, renderizar mensaje de aviso sin crash ([Testing §7.2](./GAIA_TESTING.md)).
- [ ] **Criterio**: canvas WebGL visible; la cámara orbita; FPS overlay funciona; sin WebGL2 → pantalla de aviso.

**Paso 4.2 — Esfera base + textura satelital Esri**
- [ ] `modules/globe/GlobeModule.ts` (orquestador: esfera + texturas + shaders, [Estructura §2](./GAIA_PROJECT_STRUCTURE.md)) + `modules/globe/TerrainMesh.ts` (`SphereGeometry` + `ShaderMaterial`).
- [ ] `modules/globe/TileManager.ts`: tiles de `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` con caché **LRU de 512 tiles** y `dispose()` al evictar ([Texturas §1.1 y §5.2](./GAIA_GLOBE_TEXTURES.md)).
- [ ] LOD por distancia de cámara (zoom 0–12) ([Texturas §5.1](./GAIA_GLOBE_TEXTURES.md)).
- [ ] Cargar además `earth_specular.jpg` (brillo de océanos) y `earth_normal.jpg` (normales de detalle) como capas complementarias del material ([Workflows §1](./GAIA_WORKFLOWS.md) / [Estructura §2 assets](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] **Criterio**: se ve la Tierra con textura; al hacer zoom se cargan tiles de mayor resolución; LRU libera VRAM.

**Paso 4.3 — Heightmap Terrarium + displacement (RF-02)**
- [ ] Descargar tiles `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` como textura de elevación ([Texturas §2.1](./GAIA_GLOBE_TEXTURES.md)).
- [ ] `shaders/globe/terrain.vert`: decodificar Terrarium `(R·256² + G·256 + B) − 32768` y desplazar por normal (`position + normal * elevation * u_scale`) ([Workflows §1](./GAIA_WORKFLOWS.md)).
- [ ] `shaders/globe/terrain.frag`: textura satelital + iluminación (Phong/Lambert) + mapa de normales.
- [ ] **Criterio**: montañas (Himalayas) y fosas (Marianas) visibles como relieve 3D.

**Paso 4.4 — Atmósfera y día/noche (RF-01)**
- [ ] `modules/globe/AtmosphereMesh.ts` (esfera exterior) + `shaders/globe/atmosphere.vert/frag`: halo Fresnel `pow(1.0 - dot(normal, viewDir), 3.0)` + Rayleigh + `dayFactor = max(dot(normal, uSunDirection), 0.0)` (ciclo día/noche, [Tech Stack §2.3](./GAIA_TECH_STACK.md)).
- [ ] Uniforme `uSunDirection` para iluminación dinámica.
- [ ] **Criterio**: el borde del globo emite halo azul; hay un terminador día/noche rotando.

**Paso 4.5 — Coastline y placas (contexto)**
- [ ] `modules/globe/CoastlineOverlay.ts` con `ne_110m_coastline.json` y `ne_110m_countries.json` (Natural Earth 1:110m, estáticos en el bundle, [Catálogo §5.2](./GAIA_DATA_SOURCES.md)).
- [ ] `modules/globe/TectonicPlatesOverlay.ts` con `PB2002_boundaries.json` (líneas GLSL, [Catálogo §2.4](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: costas y bordes de placas visibles a nivel global; togglables.

**Paso 4.6 — Contrato de estado con el motor**
- [ ] El render loop escribe `state.performance.*` (gate 500 ms) y lee flags de capas.
- [ ] Implementar `dispose()` en todos los módulos del globo (RNF-04)
- [ ] **Instrumentar `performance.mark('gaia:globe-ready')`** cuando el globo es interactivo (para FCP/globo-ready de [Testing §3.2](./GAIA_TESTING.md)).
- [ ] **Criterio**: `vram-leak.spec.ts` preliminar: 30 toggles de costa/placas sin crecimiento neto.

**Paso 4.7 (Opcional) — Batimetría GEBCO (fosas oceánicas en deuda del RF-02)**
- [ ] Pre-procesar GEBCO (GeoTIFF 15 arc-sec) a heightmap oceánico optimizado con `rasterio`/`numpy` en backend y servirlo como textura complementaria ([Catálogo §4.2](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: la fosa de las Marianas (~−10 994 m) se ve hundida en el océano.

**Paso 4.8 (Opcional) — Polígonos de placas y orogenias**
- [ ] Cargar `PB2002_plates.json` y `PB2002_orogens.json` como relleno semitransparente de placas ([Catálogo §2.4](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: placas coloreadas por tipo (convergente/divergente/transformante).

> **DoD Fase 4:** Globo 60 FPS con atmósfera + relieve + textura LOD + cámara; draw calls del globo = 2; sin fugas en 30 toggles; `gaia:globe-ready` instrumentado.

---

## 7. FASE 5 — Módulo Incendios (NASA FIRMS)

> **Objetivo:** Miles de focos de incendio renderizados con `InstancedMesh` y color por FRP, desde el backend ya construido (Fase 1).
> **Duración:** 6 jornadas. **Depende de:** Fases 1, 3 y 4. **RF:** RF-03, RF-04. **RNF:** RNF-02, RNF-03, RNF-04.

### Pasos

**Paso 5.1 — Worker 1: parseo y simplificación**
- [ ] `workers/ingestion.worker.ts`: parseo CSV/GeoJSON de FIRMS (`latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, confidence, frp`), `geodesicToCartesian(lat, lon, R)` ([Workflows §2](./GAIA_WORKFLOWS.md)).
- [ ] **Filtro de confianza**: descartar falsos positivos según `confidence` (`low|nominal|high`) configurable.
- [ ] Empaquetado `Float32Array(count*7)` = `x,y,z,r,g,b,scale` con **Transferable** [Workflows §2 paso 4](./GAIA_WORKFLOWS.md), estilo `self.postMessage({type: 'FIRES_READY', buffer}, [buffer.buffer])`.
- [ ] **Criterio**: test unitario del worker: buffer múltiplo de 7 y primer elemento correcto ([Testing §6.3](./GAIA_TESTING.md)).

**Paso 5.2 — FireModule + escala FRP**
- [ ] `modules/fire/FireModule.ts` (lifecycle `IGaiaModule`) + `modules/fire/FireInstancedMesh.ts` + `modules/fire/FireColorScale.ts` ([Estructura §5.3](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `utils/colorScales.ts → FireColorScale.ts`: 4 bandas exactas de [Workflows §2](./GAIA_WORKFLOWS.md) — `<10` Amarillo `(1,0.9,0.3)` 0.5× · `10–50` Naranja `(1,0.5,0.1)` 1.0× · `50–200` Rojo `(1,0.1,0.0)` 1.5× · `>200` Blanco `(1,1,0.9)` 2.0×.
- [ ] Shaders `fire.vert/frag` (posicionamiento de instancias + gradiente).
- [ ] **Criterio**: 1 draw call EXTRA; togglear la capa añade/elimina el módulo.

**Paso 5.3 — Pipeline de datos end-to-end**
- [ ] Orquestador: `fires.service.getFires(hours)` → Worker 1 → `setData(buffer)` → actualizar atributos del `InstancedMesh` (instancias sin recrear geometría: ajustar `mesh.count` + `needsUpdate`).
- [ ] **Polling configurable** (Workflow 2: activación manual o temporizador; p.ej. refresh 5 min = TTL de cache).
- [ ] `setVisible()` respeta `state.layers.fire`.
- [ ] **Criterio**: 20k focos en 1 draw call; toggles funcionan; `dispose()` libera buffers antiguos (RNF-04).

**Paso 5.4 — Degradación y filtros**
- [ ] Filtrar por `confidence` y por `timeRange` (24h/7d/30d) en Worker 1.
- [ ] Fallback local cuando la API no responde (flag `fallback: true` del contrato, [Workflows §7](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: cambiar `timeRange` re-filtra sin reconstruir toda la escena (solo recuento de instancias).

> **DoD Fase 5:** Incendios en el globo con color/tamaño por FRP, 1 draw call, worker + fallback operativos, tests de color scale (4 bandas) y worker (buffer 7 campos).

---

## 8. FASE 6 — Módulo Sismos (USGS)

> **Objetivo:** Columnas cilíndricas por sismo y animación de ondas de choque para eventos recientes.
> **Duración:** 6 jornadas. **Depende de:** Fases 1, 3 y 4. **RF:** RF-07, RF-08. **RNF:** RNF-02, RNF-03.

### Pasos

**Paso 6.1 — Normalización sísmica (Worker 1)**
- [ ] Parsear GeoJSON USGS → `usgs_event_id`, `mag`, `depth`, `place`, `time`, `tsunami`, `sig`, `type`, coords `[lon, lat, depth]` → XYZ ([Catálogo §2.1](./GAIA_DATA_SOURCES.md)).
- [ ] Empaquetar `Float32Array` para columnas.
- [ ] **Fórmulas exactas** ([Workflows §4](./GAIA_WORKFLOWS.md)): `height = (depth_km / MAX_DEPTH) * MAX_CYLINDER_HEIGHT`; `radius = Math.pow(2, magnitude - 3) * BASE_RADIUS` (escala exponencial).
- [ ] **Criterio**: test unit de dimensiones (radio exponencial y altura proporcional a profundidad).

**Paso 6.2 — Octree espacial (Worker 2)**
- [ ] `workers/spatial.worker.ts`: construir Octree 3D con los eventos y consultas de proximidad (`ProximityQueryMessage`: "sismos cerca de X", "agrupación por placas") ([Tech Stack §2.6](./GAIA_TECH_STACK.md)).
- [ ] **Criterio**: test del worker: vecinos correctos en cluster simulado.

**Paso 6.3 — Columnas InstancedMesh**
- [ ] `modules/seismic/QuakeInstancedMesh.ts` + shaders `column.vert/frag` (gradiente por magnitud verde → amarillo → rojo, [Estructura §5.2](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `modules/seismic/SeismicModule.ts` (lifecycle `IGaiaModule`).
- [ ] **Criterio**: 1–2 draw calls; columnas visibles al activar capa; sincronizadas con filtro temporal.

**Paso 6.4 — Ondas de choque (RF-08)**
- [ ] `modules/seismic/ShockwaveEffect.ts` + `shockwave.vert/frag` (anillo concéntrico: `waveFront = u_time * u_waveSpeed`, `smoothstep` en `dist` al epicentro, ámbar → amarillo, alpha 0.7) ([Workflows §4](./GAIA_WORKFLOWS.md)).
- [ ] Detección de sismo reciente (**< 2 h**) → activar animación; expiración → desactivar ([Workflows §4](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: al activar la capa con un sismo reciente, se ve expandirse el anillo desde el epicentro.

**Paso 6.5 (Opcional) — EMSC WebSocket (tiempo real)**
- [ ] Suscribir `wss://www.seismicportal.eu/standing_order/websocket` para alertas inmediatas de nuevos eventos sin polling ([Catálogo §2.2](./GAIA_DATA_SOURCES.md)); renderizar la columna + onda al `onmessage`.
- [ ] **Criterio**: un sismo publicado por EMSC aparece en < 10 s sin re-fetch.

> **DoD Fase 6:** Columnas + ondas de choque en el globo; Octree consultando; toggles y filtros funcionales.

---

## 9. FASE 7 — Módulo Viento (Open-Meteo + GPU)

> **Objetivo:** Sistema de partículas de viento actualizado en GPU (Transform Feedback) desde la rejilla U/V.
> **Duración:** 8 jornadas. **Depende de:** Fases 1, 3 y 4. **RF:** RF-05, RF-06. **RNF:** RNF-01, RNF-03.

### Pasos

**Paso 7.1 — Decodificador de viento (Worker 3)**
- [ ] `workers/wind.worker.ts`: parsear rejilla U/V (JSON o FlatBuffers de Open-Meteo, [Catálogo §3.1](./GAIA_DATA_SOURCES.md)); apoyarse en la conversión ya hecha en backend o recalcular `speed = √(U²+V²)`, `θ = atan2(V, U)`.
- [ ] Generar array **RGBA para `DataTexture`** con layout exacto de [Workflows §3](./GAIA_WORKFLOWS.md): `R = U, G = V, B = speed, A = reserved`.
- [ ] Resolución configurable (0.1°, 0.5°, 1°).
- [ ] **Criterio**: test unit: el texel RGBA que produce el worker coincide con el layout del shader.

**Paso 7.2 — DataTexture y VBO de partículas**
- [ ] `modules/wind/WindDataTexture.ts`: `new THREE.DataTexture(data, w, h, RGBAFormat, FloatType)` + `needsUpdate`.
- [ ] `modules/wind/WindParticleSystem.ts`: VBO con ~18 000 posiciones semilla aleatorias sobre la capa atmosférica (radio > terrestre) para mantener > 20 000 datos combinados con las demás capas (RNF-01).
- [ ] **Criterio**: 1 draw call (Points); `state.wind.particleCount` refleja el conteo.

**Paso 7.3 — GPU update loop (RF-06)**
- [ ] `shaders/wind/particle.vert`: leer `u_windField`, **interpolar bilinealmente** U,V, `positionToUV(a_position)` → desplazamiento `windToCartesian(U,V,pos) * u_speedFactor * u_deltaTime`, `normalize(pos+disp)*u_globeRadius`, `gl_PointSize = 2.0` ([Workflows §3](./GAIA_WORKFLOWS.md)).
- [ ] `particle.frag`: color por velocidad + fade por TTL.
- [ ] **Reciclado por TTL**: partículas al final de su vida se resetean a una posición aleatoria (densidad constante sin crear/destruir geometría, [Workflows §3](./GAIA_WORKFLOWS.md)).
- [ ] **Transform Feedback** (WebGL 2.0) escribiendo nuevas posiciones al VBO en cada frame.
- [ ] **Criterio**: las partículas fluyen siguiendo el viento global (alisios visibles); 60 FPS sostenidos.

**Paso 7.4 — Integración y filtros**
- [ ] Altura configurable: `wind_speed_10m`, `wind_speed_80m`, `windspeed_100hPa` (~16 km) vía selector en state ([Catálogo §3.1](./GAIA_DATA_SOURCES.md)).
- [ ] Muestreo de la partícula bajo el cursor → `state.wind.speedKnots` (convertir km/h → nudos: `/1.852`) y `directionDeg`.
- [ ] **Criterio**: el HUD muestra viento de la partícula bajo el cursor (datos listos para Fase 10).

**Paso 7.5 (Opcional) — Feed NOAA GFS en GPU**
- [ ] Consumir la rejilla pre-recortada por el backend (Fase 1.8 opcional) como `DataTexture` alternativa de alta resolución 0.25° ([Catálogo §3.2](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: misma tubería de shaders; solo cambia la fuente de la textura.

> **DoD Fase 7:** Campo de partículas continuo en GPU a 60 FPS; TTL y reciclaje; altura configurable; DataTexture vía Worker 3.

---

## 10. FASE 8 — Módulo Inundación (Nivel del Mar)

> **Objetivo:** Shader de agua con slider +0m a +10m que enmascara zonas costeras sumergidas.
> **Duración:** 6 jornadas. **Depende de:** Fase 4. **RF:** RF-09, RF-10. **RNF:** RNF-01.

### Pasos

**Paso 8.1 — Uniformes y WaterMesh**
- [ ] `modules/flood/FloodModule.ts` + `modules/flood/WaterMesh.ts`: malla de agua sobre el globo con `ShaderMaterial` desplazamiento ondulante leve ([Estructura §5.2](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] Uniformes: `u_seaLevel`, `u_waveAnimation`, `u_time`.
- [ ] `shaders/flood/water.vert`: superficie con leve displacement.
- [ ] **Criterio**: al activar capa "flood", se ve una esfera de agua ondulando.

**Paso 8.2 — Slider + state.flood.seaLevel (fuente de verdad)**
- [ ] `hud/SeaLevelSlider.tsx` (+0m a +10m, step 0.1) mutando `state.flood.seaLevel` con clamp ([GAIA_STATE §3.3](./GAIA_STATE.md)).
- [ ] El render loop lee `state.flood.seaLevel` → `globeMaterial.uniforms.u_seaLevel.value` (ruta Three.js directa, **sin re-render React**, [Workflows §5](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: deslizar cambia el uniforme sin re-render (profiler).

**Paso 8.3 — Mascarado costero (RF-10)**
- [ ] `shaders/flood/water.frag` de [Workflows §5](./GAIA_WORKFLOWS.md): `elevation = texture2D(u_heightmap, uv).r * MAX_ELEVATION`; si `elevation <= u_seaLevel` → agua `vec3(0.0, 0.3, 0.7)` con `alpha = mix(0.4, 0.85, depth)`; si no → textura normal.
- [ ] **Criterio**: al subir a +5 m, costas bajas (Florida/Delhi/Bangladesh) sumergidas; montañas emergen. Todo en GPU por píxel (60 FPS al arrastrar).

**Paso 8.4 — Elevación puntual en la costa (para telemetría)**
- [ ] Al hacer clic en una zona sumergida, el HUD muestra "altitud: X m s.n.m." vía `/api/elevation` (Open-Meteo, caché 24 h).
- [ ] **Criterio**: `elevation.service` test + UI en Fase 10.

**Paso 8.5 (Opcional) — Recortes costeros de precisión (Copernicus DEM)**
- [ ] Pre-procesar DEM GLO-30 (30 m) por bounding box a heightmap PNG en backend para determinar con exactitud qué áreas quedan sumergidas entre +0 y +10 m ([Catálogo §4.3](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: al acercar a una costa, la máscara de inundación usa el DEM de 30 m en vez del Terrarium.

**Paso 8.6 (Opcional) — Referencia real de mareas (NOAA Tides)**
- [ ] Overlay de estaciones mareográficas con nivel de agua actual y tendencia (mm/año) desde `api.tidesandcurrents.noaa.gov` ([Catálogo §4.4](./GAIA_DATA_SOURCES.md)).
- [ ] **Criterio**: el slider muestra el nivel de la estación seleccionada como referencia.

> **DoD Fase 8:** Inundación costera dinámica en GPU; slider 0–10 m sin re-renders; test GLSL de comparación de umbral.

---

## 11. FASE 9 — Módulo Radiación (Safecast, EURDEP, RadNet, GMCMap)

> **Objetivo:** Sensores radiológicos con umbrales de alerta GLSL (normal/elevated/critical) y parpadeo crítico.
> **Duración:** 6 jornadas. **Depende de:** Fases 1 y 4. **RF:** RF-13, RF-14. **RNF:** RNF-02, RNF-03, RNF-04.

### Pasos

**Paso 9.1 — Normalización en backend (reforzar, RF-13)**
- [ ] Verificar `test_radiation.py` con los 4 casos de [Testing §6.1](./GAIA_TESTING.md) (CPM→µSv/h factor 334; nSv/h; ya-normalizado; unidad desconocida → error) y tolerancia 3 %.
- [ ] Fusión de las 4 fuentes por estación/hora con dedup `(station_id, sampled_at)` (Fase 1.6 + Fase 2.3).
- [ ] **Criterio**: un payload con `raw_unit: CPM` llega al frontend ya en `value_usvh`.

**Paso 9.2 — Worker 1: niveles de alerta**
- [ ] Empaquetar `Float32Array(count*8)` = `x,y,z,r,g,b,usvh,alertLevel` con **Transferable** (`RADIATION_READY`, [Workflows §8](./GAIA_WORKFLOWS.md)).
- [ ] `modules/radiation/AlertThresholds.ts` con umbrales exactos de [Spec RF-14](./GAIA_SPECIFICATION.md): `<0.20 normal` (verde `(0.2,0.8,0.4)`), `0.20–1.00 elevated` (amarillo `(1.0,0.7,0.1)`), `>1.00 critical` (rojo `(1.0,0.1,0.0)`).
- [ ] **Criterio**: test unit de umbrales y colores.

**Paso 9.3 — Renderizado (InstancedMesh o heatmap)**
- [ ] `modules/radiation/RadiationMesh.ts`: `InstancedMesh` de puntos **o** shader de **mapa de calor esférico** para redes densas (EURDEP) ([Estructura §5.2](./GAIA_PROJECT_STRUCTURE.md)).
- [ ] `shaders/radiation/radiation.vert/frag`: color por umbral + **parpadeo crítico** `pulse = sin(u_time * 6.0) * 0.5 + 0.5` (3 Hz), `mix(color, blanco, pulse*0.4)`, `alpha = mix(0.6, 1.0, pulse)` si `>1.0 µSv/h` ([Workflows §8](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: 1 draw call; sensores críticos parpadeando (p.ej. zona post-Fukushima).

**Paso 9.4 — Alerta HUD**
- [ ] `state.radiation.criticalCount` actualizado por el orquestador al recibir datos.
- [ ] `Badge critical` parpadeante en el HUD cuando `criticalCount > 0`.
- [ ] **Criterio**: badge rojo refleja el contador de sensores críticos.

> **DoD Fase 9:** Radiación con normalización verificada (4 fuentes), umbrales GLSL, parpadeo crítico y badge; 1 draw call.

---

## 12. FASE 10 — HUD Analítico, Interacción y Time-Scrubber

> **Objetivo:** Clic → telemetría (RF-11), toggles de capas y filtro temporal (RF-12), feed de alertas y re-filtrado con limpieza de VRAM.
> **Duración:** 6 jornadas. **Depende de:** Fases 3–9. **RF:** RF-11, RF-12. **RNF:** RNF-04.

### Pasos

**Paso 10.1 — Raycasting e instancias**
- [ ] `Raycaster` optimizado sobre los `InstancedMesh` de fuego/sismo/radiación y las `Points` de viento ([Workflows §6](./GAIA_WORKFLOWS.md)).
- [ ] `intersectObject` → `instanceId` → lookup en el buffer del worker.
- [ ] **Criterio**: clic sobre un foco selecciona SU instancia exacta (test con proyección simulada).

**Paso 10.2 — selectObject / telemetría (RF-11)**
- [ ] Al clic: `selectObject({type, instanceId, lat, lon, data})` → `state.telemetry.open = true` ([GAIA_STATE §3.4](./GAIA_STATE.md)).
- [ ] `panels/TelemetryPanel.tsx` conmuta por `type` a los subpaneles de [Estructura §5.5](./GAIA_PROJECT_STRUCTURE.md):
  - `FireDetail`: coordenadas, **brightness (K)**, **FRP (MW/km²)**, **instrumento (VIIRS/MODIS)**, **confianza**.
  - `QuakeDetail`: coordenadas, **magnitud**, **profundidad (km)**, **lugar**, **timestamp**.
  - `WindDetail`: coordenadas, **velocidad (nudos)**, **dirección (°)**, **componentes (U, V)**.
  - `RadiationDetail`: coordenadas, **µSv/h**, **valor raw/unidad**, **station_id**, **nivel de alerta**.
- [ ] **Criterio**: panel flotante con datos correctos al clic; `clearSelection` al clic en vacío o ✕.

**Paso 10.3 — Time-scrubber + re-filtrado con limpieza (RF-12)**
- [ ] `hud/TimeScrubber.tsx` (24h/7d/30d) → `setTimeFilter`.
- [ ] En cambio de rango: workers re-filtran → `dispose()` de geometrías viejas (**obligatorio antes de reconstruir**, [Workflows §6](./GAIA_WORKFLOWS.md)) → reconstrucción.
- [ ] **Criterio**: reacomodación de filtro < 200 ms sin jank y **sin crecimiento neto de VRAM** (comparar `renderer.info.memory`, [Testing §2.4](./GAIA_TESTING.md)).

**Paso 10.4 — Capas y mini-controles de módulo**
- [ ] `hud/LayerControls.tsx` (5 toggles: Fuego, Viento, Sismos, Inundación, Radiación).
- [ ] Selectores de módulo: altura de viento (10m/80m/100hPa), resolución de rejilla, activación de ondas sísmicas.
- [ ] **Criterio**: toggles quirúrgicos sin re-renders masivos (Valtio, [GAIA_STATE §5](./GAIA_STATE.md)).

**Paso 10.5 — Highlight visual de selección**
- [ ] Anillo/borde de resaltado sobre la instancia seleccionada (Three.js) coherente con el panel ([Workflows §6](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: al hacer clic el objeto se resalta en 3D y el panel muestra su telemetría.

**Paso 10.6 (Opcional) — Feed de alertas en tiempo real**
- [ ] `hud/AlertFeed.tsx`: lista cronológica de eventos (sismos < 2 h, radiación crítica, incendios extremos FRP > 200) alimentada por los orquestadores ([Spec §2.5](./GAIA_SPECIFICATION.md)).
- [ ] **Criterio**: el feed añade entradas al ocurrir eventos nuevos y es desestimable.

> **DoD Fase 10:** Interacción completa clic→panel (+ highlight); filtros re-ejecutan workers liberando VRAM; toggles y controles operativos; feed de alertas (si se implementa).

---

## 13. FASE 11 — Resiliencia End-to-End y Modo Resguardo

> **Objetivo:** La cadena Redis → API → local del backend se refleja de extremo a extremo en el HUD (RNF-05) y todo el cómputo pesado vive en workers (RNF-03).
> **Duración:** 4 jornadas. **Depende de:** Fases 1–10. **RF/RNF:** RNF-03, RNF-05.

### Pasos

**Paso 11.1 — Orquestador de conexión**
- [ ] Módulo que escribe `setConnectionStatus(module, ...)` según respuesta (`live | cached | fallback | error`) leyendo los flags `cached: true | fallback: true` del contrato ([GAIA_STATE §3.5](./GAIA_STATE.md)).
- [ ] `StatusIndicator` refleja el estado **por módulo**.
- [ ] **Criterio**: simulando API caída (msw, [Testing §5.2](./GAIA_TESTING.md)), el badge pasa a CACHÉ/RESGUARDO y la app sigue renderizando.

**Paso 11.2 — Fallback local pleno (datasets de resguardo)**
- [ ] Verificar que los 5 datasets de `backend/app/fallback/` de [Estructura §3](./GAIA_PROJECT_STRUCTURE.md) producen visuales equivalentes al flujo en vivo: `firms_latest.json`, `quakes_latest.json`, `wind_grid_latest.bin`, `radiation_latest.json` (+ `heightmap_global.png` si se añade).
- [ ] **Criterio**: sin `FIRMS_MAP_KEY` la capa de fuego sigue mostrando focos de muestra (badge RESGUARDO).

**Paso 11.3 — Auditoría de hilos (RNF-03)**
- [ ] Confirmar que NO hay parseos/decodificaciones/interpolaciones pesadas en el hilo principal (Profiler + `tests/workers` contract) — move a workers cualquier residual ([Tech Stack §2.6](./GAIA_TECH_STACK.md)).
- [ ] **Criterio**: main thread idle en ~95 % del frame durante las 5 capas activas.

**Paso 11.4 — Degradación transparente en servicios**
- [ ] `services/*.service.ts` retornan el dataset de resguardo si `fetchAPI` lanza error (no romper el flujo de workers) siguiendo el [Workflow 7](./GAIA_WORKFLOWS.md).
- [ ] **Criterio**: la UI nunca muestra una pantalla de error ante upstream caído (solo badge).

> **DoD Fase 11:** Degradación transparente verificada por tests (pytest + msw); workers absorben todo el peso; badges correctos por módulo.

---

## 14. FASE 12 — Seguridad y Privacidad (Hardening)

> **Objetivo:** Aplicar [GAIA_SECURITY](./GAIA_SECURITY.md) de extremo a extremo: rate limiting, DDoS básico, XSS, cabeceras, sesión y CSP.
> **Duración:** 4 jornadas. **Depende de:** Fases 1–3 y 11. **RNF:** RNF-07 (parcial), GDPR/privacidad.

### Pasos

**Paso 12.1 — Rate limiting (slowapi + Redis)**
- [ ] `slowapi` con `Limiter(key_func=get_remote_address, storage_uri=REDIS_URL)` — la clave incluye el prefijo del endpoint ([Seguridad §4.1](./GAIA_SECURITY.md)).
- [ ] **Almacén en Redis** (no en memoria) para que los límites persistan entre instancias/workers.
- [ ] Aplicar la tabla exacta de [Seguridad §4.1](./GAIA_SECURITY.md): global `120/min (burst 240)` por IP; `fires` 60/min; `quakes` 60/min; `wind` 30/min; `radiation` 30/min; `elevation` 120/min; `/health` **exento** (uptime checks).
- [ ] Respuesta `429` con contrato `UPSTREAM_RATE_LIMITED` + `details.retry_after_seconds` + cabeceras `Retry-After` y `RateLimit-*` ([Seguridad §4.2](./GAIA_SECURITY.md)).
- [ ] **Criterio**: test que dispara 200 req/min → `429` con contrato ([Seguridad §10](./GAIA_SECURITY.md)).

**Paso 12.2 — Sesión por cookie**
- [ ] `gaia_session` con token opaco (UUIDv4 256 bits), `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` (30 días) ([Seguridad §3.1](./GAIA_SECURITY.md)).
- [ ] `touch_session` (Fase 2) integrado; nunca se guarda/loguea el token crudo (solo `sha256`).
- [ ] **Criterio**: audit de atributos de `Set-Cookie` + DB solo con hashes ([Seguridad §10](./GAIA_SECURITY.md)). Cero endpoints de escritura (la API es solo lectura, [Seguridad §3.2](./GAIA_SECURITY.md)).

**Paso 12.3 — Headers y CSP**
- [ ] Headers de [Seguridad §6.2](./GAIA_SECURITY.md) en backend y Nginx: `CSP` (`default-src 'self'; script-src 'self' 'nonce-{n}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://server.arcgisonline.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- [ ] **CSP nonce** inyectado por `html-webpack-plugin` (scripts inline permitidos solo con nonce, [Seguridad §6.2](./GAIA_SECURITY.md)).
- [ ] **XSS**: regla `react/no-danger` (sin `dangerouslySetInnerHTML`); `xss.spec.tsx` verifica que `place: "<img onerror=...>"` se renderiza como texto plano ([Seguridad §6.3](./GAIA_SECURITY.md)).
- [ ] **Criterio**: tests de cabeceras en CI + `xss.spec.tsx` verde.

**Paso 12.4 — DDoS y límites de recursos**
- [ ] Nginx (Opción B): `limit_req` + `limit_conn` **100 conexiones/IP**, `client_max_body_size 1M`, timeouts de proxy ≤ 5 s (alineados con fallback upstream) ([Seguridad §5.2 y §5.3](./GAIA_SECURITY.md)).
- [ ] Backpressure: si Redis no responde, `slowapi` falla rápido (`fail-fast`) en vez de encolar ([Seguridad §5.2](./GAIA_SECURITY.md)).
- [ ] Logs sin PII: omitir cookies/IPs completos; loguear solo el hash de sesión ([Seguridad §7](./GAIA_SECURITY.md)).
- [ ] **Criterio**: revisión de código SQLAlchemy parametrizado y logs sanitizados.

**Paso 12.5 — Supply chain y privacidad**
- [ ] Lockfiles: `package-lock.json` y `pip freeze` congelados; CI ejecuta `npm audit --audit-level=high` + `pip-audit` bloqueando severity ≥ high ([Seguridad §8](./GAIA_SECURITY.md)); imágenes Docker con tags pinneados y escaneo `trivy` opcional.
- [ ] Aviso discreto de cookies en footer/HUD + purga de sesiones (60 días) ([Seguridad §9](./GAIA_SECURITY.md)).
- [ ] **Criterio**: auditorías verdes; texto de privacidad presente.

**Paso 12.6 (Opcional) — Edge CDN (producción)**
- [ ] Cloudflare delante de frontend+backend: regla edge > 300 req/min/IP → 429, WAF gestionado y chalenge ligero (JS challenge, sin CAPTCHA para no romper FCP < 2 s) ([Seguridad §5.1](./GAIA_SECURITY.md)).
- [ ] **Criterio**: smoke bajo throttling sin penalizar usuarios reales.

> **DoD Fase 12:** Rate-limit con almacén Redis y 429 con contrato; sesión segura; CSP/hardening; XSS test; auditorías y privacidad en CI.

---

## 15. FASE 13 — Optimización 60 FPS y Memoria GPU

> **Objetivo:** Cumplir RNF-01 (60 FPS con >20k datos), RNF-02 (≤8 draw calls) y RNF-04 (cero fugas VRAM).
> **Duración:** 8 jornadas. **Depende de:** Fases 4–9. **RNF:** RNF-01, RNF-02, RNF-04.

### Pasos

**Paso 13.1 — Instrumentación de rendimiento y escenarios**
- [ ] `core/Stats.ts` completo: FPS rolling, `renderer.info.render.calls/triangles`, `info.memory` ([Testing §2.1](./GAIA_TESTING.md)).
- [ ] `perf/fps.spec.ts` (60 s) con la plantilla de [Testing §2.3](./GAIA_TESTING.md) (assert `avgFps ≥ 60`, `p95FrameMs ≤ 18`, `maxDrawCalls ≤ 8`).
- [ ] `memory/vram-leak.spec.ts` (100 toggles) de [Testing §4.2](./GAIA_TESTING.md) (crecimiento neto **cero** en `geometries/textures/programs`; repetir 5 ciclos de 100 antes de declarar verde).
- [ ] **Criterio**: medidas reproducibles con `devicePixelRatio` cap 2.0 y máquina de referencia (SwiftShader/ANGLE en CI).

**Paso 13.2 — Presupuesto de draw calls**
- [ ] Reporte real por módulo según la tabla de [Testing §2.2](./GAIA_TESTING.md): globo 2, fire 1, wind 1, seismic 1–2, flood 1, radiation 1 → **total 7–8**.
- [ ] Consolidar meshes redundantes; evitar creación de geometría por frame; usar `InstancedMesh` para todo objeto repetitivo (RF-02 RNF).
- [ ] **Criterio**: `max(drawCalls) ≤ 8` en el test de 60 s con las 5 capas.

**Paso 13.3 — Optimización GPU y CPU**
- [ ] LOD de tiles + cap DPR 2.0 (Resizer ya lo hace; verificar en el build).
- [ ] Pool de vectores temporales (eliminar `new Vector3` en hot paths); invalidación correcta de `needsUpdate` en atributos dinámicos.
- [ ] Verificar code splitting (Fase 3.7): chunks de módulos pesados solo al activar su capa (RNF-01/06).
- [ ] **Criterio**: p95 frame ≤ 18 ms con 20k datos.

**Paso 13.4 — Escenarios de estrés documentados**
- [ ] Medir los 4 escenarios de [Testing §2.4](./GAIA_TESTING.md): baseline (globo, 2 DC) · aceptación (20k, ≤8 DC) · **estrés 50k** (documentar FPS/ms y DC, no se exige 60 FPS) · 50 cambios de filtro (< 200 ms sin jank).
- [ ] **Criterio**: informe con el punto de degradación para fijar el tope real de datos y justificar LOD ([Testing §2.4](./GAIA_TESTING.md)).

**Paso 13.5 — Vuelta a cero de la fuga VRAM**
- [ ] Barrido `dispose()` garantizado por `SceneManager` + `disposeObject3D` (utils) en toda la app ([Workflows §6](./GAIA_WORKFLOWS.md)).
- [ ] **Criterio**: `vram-leak.spec.ts` verde tras 5×100 toggles (estabilización tras 2–3 GC, [Testing §4.3](./GAIA_TESTING.md)).

> **DoD Fase 13:** 60 FPS (p95 ≤ 18 ms) con 20k datos y todas las capas; ≤8 draw calls; test VRAM verde; informe de estrés 50k.

---

## 16. FASE 14 — Testing Integral, Compatibilidad y CI/CD

> **Objetivo:** Cerrar el lazo de calidad: Lighthouse (RNF-06), navegadores (RNF-07), cobertura y pipeline completo.
> **Duración:** 6 jornadas. **Depende de:** Fases 1–13. **RNF:** RNF-06, RNF-07.

### Pasos

**Paso 14.1 — Cobertura y contrato**
- [ ] `test_contract.py` iterando sobre TODOS los endpoints (incluidos `/api/history/*` y los 7 códigos de error) ([Testing §5.3](./GAIA_TESTING.md)).
- [ ] Cobertura objetivo: `frontend/src/utils/` y `store/actions.ts` ≥ 80 %; `radiation_normalizer.py` y `coordinates.ts` ≥ 90 % ([Testing §1](./GAIA_TESTING.md)).
- [ ] **Criterio**: `pytest --cov` y `vitest --coverage` en los umbrales.

**Paso 14.2 — Lighthouse y presupuestos (RNF-06)**
- [ ] `performance.mark('gaia:boot')` (Fase 0.5) y `performance.mark('gaia:globe-ready')` (Fase 4.6) ligados con `measure` en `main.ts` ([Testing §3.2](./GAIA_TESTING.md)).
- [ ] `npm run lighthouse:ci` con perfil **4G** → FCP < 2.0 s, `gaia:globe-ready` < 3.5 s; el caso 3G es informativo ([Testing §3.3](./GAIA_TESTING.md)).
- [ ] `size-limit` con **JS inicial ≤ 450 KB gzip** (chunks: ≤180 KB arranque, ≤250 KB Three.js, ≤120 KB HUD).
- [ ] **Criterio**: Lighthouse no regresa en CI; build falla si supera budget.

**Paso 14.3 — Compatibilidad de navegadores (RNF-07)**
- [ ] Playwright: smoke en Chrome, Firefox, Safari (WebKit), Edge — **muestreo de píxeles del canvas**, consola sin errores GLSL, 3 workers con handshake, `StatusIndicator` en `LIVE` ([Testing §7.1–7.3](./GAIA_TESTING.md)).
- [ ] Checklist por navegador de [Testing §7.4](./GAIA_TESTING.md): WebGL2 sin `webglcontextcreationerror`, shaders compilan de primer frame, workers responden, 60 FPS nominales, raycasting OK, cero excepciones en 60 s.
- [ ] BrowserStack/LambdaTest como opción si falta hardware.
- [ ] **Criterio**: 4 smoke tests verde + checklist manual pre-release.

**Paso 14.4 — Pipeline CI/CD completo**
- [ ] `ci.yml` con los 7 gates de [Testing §8.1](./GAIA_TESTING.md) / [Deployment §6.3](./GAIA_DEPLOYMENT.md): 1 lint+typecheck, 2 unit front (vitest), 3 unit backend (pytest), 4 perf checks (`npm run perf:check` draw calls + budget), 5 Lighthouse, 6 smoke e2e Playwright, 7 build+deploy (solo `main`).
- [ ] **Frecuencia**: 1–3 en cada PR; 4–6 en PR a main y/o nightly; 7 al mergear.
- [ ] **Criterio**: un PR completo pasa los 7 gates; main despliega automáticamente.

> **DoD Fase 14:** Toda la matriz [RNF ↔ método](./GAIA_TESTING.md) cubierta y automatizada (8.1); CI/CD verde desde cero.

---

## 17. FASE 15 — Despliegue, Monitoreo y Operaciones

> **Objetivo:** Publicar GAIA en producción con monitoreo, backups y alertas según [GAIA_DEPLOYMENT](./GAIA_DEPLOYMENT.md).
> **Duración:** 5 jornadas. **Depende de:** Fase 14. **RNF/RF:** operaciones.

### Pasos

**Paso 15.1 — Producción**
- [ ] **Opción A (PaaS)**: frontend en Vercel/Netlify (`npm run build`, output `frontend/dist`, `GAIA_API_BASE_URL`); backend en Railway/Render (Dockerfile); Redis gestionado (Railway Render / Upstash); `CORS_ORIGINS` = URL pública del frontend ([Deployment §6.1](./GAIA_DEPLOYMENT.md)).
- [ ] **Opción B (VPS)**: Nginx TLS con Let's Encrypt (`certbot --nginx -d gaia.example.com`), `root /var/www/gaia`, `try_files ... /index.html` (SPA), `location /api/ → proxy_pass 127.0.0.1:8000` con `X-Forwarded-*`; despliegue `docker compose up -d --build` + `rsync -a frontend/dist/ /var/www/gaia/` ([Deployment §6.2](./GAIA_DEPLOYMENT.md)).
- [ ] **Criterio**: URL pública con TLS válido y CORS funcionando.

**Paso 15.2 — Secrets y configuración por entorno**
- [ ] `FIRMS_MAP_KEY` y `DB_PASSWORD` en secrets manager del provider / GitHub Actions (nunca en repo) ([Deployment §4](./GAIA_DEPLOYMENT.md)).
- [ ] `.env` por entorno (staging/prod); `PUBLIC_FRONTEND_URL` y `CORS_ORIGINS` correctos.
- [ ] **Criterio**: cero secrets en el repo (auditoría `gitleaks` opcional en CI).

**Paso 15.3 — Monitoreo y alertas**
- [ ] **Uptime check** sobre `/health` (UptimeRobot / Vercel Cron / systemd timer): alerta si `status != ok` o `redis != connected` ([Deployment §7.1](./GAIA_DEPLOYMENT.md)).
- [ ] **Logging estructurado**: logs JSON con `request_id`; errores de upstream con `error.code`; rotación fuera del contenedor (`/var/log/gaia/`) ([Deployment §7.2](./GAIA_DEPLOYMENT.md)).
- [ ] **Métricas Redis**: hit rate < 0.6 sostenido, TTL expirados masivos, latency P95 > 50 ms ([Deployment §7.3](./GAIA_DEPLOYMENT.md)).
- [ ] **Alertas** de [Deployment §7.4](./GAIA_DEPLOYMENT.md): 3+ fallos consecutivos de API en 10 min; Redis desconectado; FPS < 45 al night; disk/CPU > 85 %.
- [ ] **Criterio**: alerta real cuando se detiene el backend (prueba de humo).

**Paso 15.4 — Backups y recuperación**
- [ ] WAL archiving + `pg_dump` diario (cron); doc de restauración (RPO ≤ 24 h, RTO ≤ 1 h) ([GAIA_DATABASE §6.2](./GAIA_DATABASE.md)).
- [ ] `docker compose` de producción con volúmenes persistentes (`postgres-data`, `redis-data`).
- [ ] **Criterio**: DR test con restauración probada al menos una vez.

> **DoD Fase 15:** App en producción, monitoreada, con backups verificado y alertas reales.

---

## 18. FASE 16 — Pulido Final, Docs y Demostración

> **Objetivo:** Cierre del proyecto: README pulido, video/demo, licencia y documento de arquitectura final.
> **Duración:** 3 jornadas. **Depende de:** Fase 15.

### Pasos

**Paso 16.1 — README y showcase**
- [ ] README con screenshot, instrucciones, badges (CI, cobertura), arquitectura y enlaces a todos los docs.
- [ ] Grabación demostrativa (globo + las 5 capas + telemetría + modo resguardo).
- [ ] **Criterio**: una persona nueva reproduce el proyecto con los comandos del README.

**Paso 16.2 — Revisión/consolidación de docs**
- [ ] Verificar coherencia entre todos los documentos (roadmap, spec, workflows, testing, deployment, security, db).
- [ ] Rellenar **métricas reales** de las Fases 13/14 en [GAIA_TESTING](./GAIA_TESTING.md) (FPS medidos, draw calls, VRAM, estrés 50k) — los números de esta guía son objetivos, no resultados.
- [ ] **Criterio**: sin referencias rotas; matrices de trazabilidad RF/RNF cubiertas.

**Paso 16.3 — Licencia y cierre**
- [ ] Definir licencia (MIT sugerida) en `LICENSE`.
- [ ] CHANGELOG y TAG `v1.0.0`.
- [ ] **Criterio**: repo listo para mostrarse públicamente.

---

## 19. Matriz de Trazabilidad Fase ↔ RF/RNF

| Fase            | RF cubiertos                              | RNF cubiertos                     | Arquitectura clave           |
| --------------- | ----------------------------------------- | --------------------------------- | ---------------------------- |
| 0 Boot          | —                                         | —                                 | Tooling, CI                  |
| 1 Backend       | RF-13 (normalización)                     | RNF-05 (backend)                  | FastAPI + Redis + contrato   |
| 2 DB            | —                                         | RNF-05, privacidad                | PG18 + TimescaleDB + sesiones |
| 3 Frontend      | RF-12 (parcial)                           | RNF-06 (bundle), RNF-03 (base)    | Valtio + servicios + workers |
| 4 Globo         | RF-01, RF-02                              | RNF-01, RNF-06, RNF-07            | Three.js + shaders + LOD     |
| 5 Incendios     | RF-03, RF-04                              | RNF-02, RNF-03, RNF-04            | Worker 1 + InstancedMesh     |
| 6 Sismos        | RF-07, RF-08                              | RNF-02, RNF-03                    | Worker 1/2 + InstancedMesh   |
| 7 Viento        | RF-05, RF-06                              | RNF-01, RNF-03                    | Worker 3 + DataTexture + TF  |
| 8 Inundación    | RF-09, RF-10                              | RNF-01                            | Shader agua + slider         |
| 9 Radiación     | RF-13, RF-14                              | RNF-01, RNF-03, RNF-04            | Worker 1 + InstancedMesh/heatmap |
| 10 HUD          | RF-11, RF-12                              | RNF-04                            | Raycast + Telemetry          |
| 11 Resiliencia  | —                                         | RNF-03, RNF-05                    | Orquestador + workers        |
| 12 Seguridad    | —                                         | RNF-07 (parcial), GDPR            | rate-limit + cookie + CSP    |
| 13 Optimización | —                                         | RNF-01, RNF-02, RNF-04            | GPU/VRAM tuning              |
| 14 Testing      | —                                         | RNF-06, RNF-07                    | Lighthouse + Playwright + CI |
| 15 Despliegue   | —                                         | —                                 | Prod + monitoreo             |
| 16 Cierre       | —                                         | —                                 | Docs + demo                  |

---

## 20. Requisitos Transversales: Puntos de Control Numéricos

Checklist consolidada de los **números y contratos** que la documentación fija y que cualquier fase debe respetar (fuente: workflow/spec que los define):

| Requisito / Contrato                                  | Valor fijado                                                            | Referencia                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| Contrato universal                                    | `{ success, data, error }` en **toda** respuesta                        | [API Contract §2](./GAIA_API_CONTRACT.md)   |
| Códigos de error (catálogo)                           | 7 codes: `VALIDATION_ERROR` … `INTERNAL_SERVER_ERROR`                   | [API Contract §6](./GAIA_API_CONTRACT.md)   |
| TTL incendios / sismos / viento / radiación / elev.   | 300 s / 60 s / 900 s / 300 s / 86400 s                                  | [Deployment §4.2](./GAIA_DEPLOYMENT.md)     |
| Fallback por módulo                                   | Redis → API externa → dataset local (`cached:` / `fallback:`)           | [Workflows 7](./GAIA_WORKFLOWS.md)          |
| Retención DB                                          | fires 90 d · quakes 365 d · rad 90 d · wind 30 d · elev 365 d           | [GAIA_DATABASE §4.2](./GAIA_DATABASE.md)    |
| Sesión                                                | `gaia_session` · sha256(token) · 30 días · sin IP / cookie cruda        | [GAIA_DATABASE §8](./GAIA_DATABASE.md)      |
| FPS / frame / draw calls / datos simult.              | ≥ 60 FPS · p95 ≤ 18 ms · ≤ 8 DC · > 20 000 datos                        | [Testing §2.2](./GAIA_TESTING.md)           |
| Estrés                                                | 50 000 datos → documentar degradación; 50 cambios de filtro < 200 ms    | [Testing §2.4](./GAIA_TESTING.md)           |
| FCP / globo ready (4G)                                | < 2.0 s · < 3.5 s                                                        | [Testing §3.2](./GAIA_TESTING.md)           |
| Bundle inicial gzip                                   | ≤ 450 KB (arranque ≤ 180, Three ≤ 250, HUD ≤ 120)                       | [Deployment §5.1](./GAIA_DEPLOYMENT.md)     |
| Draw calls por módulo                                 | globo 2 · fire 1 · wind 1 · seismic 1–2 · flood 1 · radiation 1         | [Estructura §5.3](./GAIA_PROJECT_STRUCTURE.md) |
| Rate limit por endpoint                               | global 120/min(burst240) · fires 60 · quakes 60 · wind 30 · rad 30 · elev 120 · health exento | [Seguridad §4.1](./GAIA_SECURITY.md) |
| Nginx / recursos                                      | `limit_conn` 100/IP · body 1 MB · timeout upstream 5 s + 3 reintentos   | [Seguridad §5.3](./GAIA_SECURITY.md)        |
| Radiación                                             | `<0.20 normal` · `0.20–1.00 elevated` · `>1.00 critical`; CPM/334       | [Spec RF-14](./GAIA_SPECIFICATION.md)       |
| Incendios                                             | FRP bandas `<10 / 10–50 / 50–200 / >200` con colores y escala exactos   | [Workflows 2](./GAIA_WORKFLOWS.md)          |
| Time-scrubber / slider agua                           | 24h / 7d / 30d · +0 a +10 m (step 0.1, clamp)                           | [GAIA_STATE §2.3](./GAIA_STATE.md)          |
| Históricos                                            | máx. 20 000 puntos/respuesta (muestreo) · `OFFSET/LIMIT` · `time DESC`  | [GAIA_DATABASE §7](./GAIA_DATABASE.md)      |

---

## 21. Riesgos Principales y Mitigaciones

| Riesgo                                   | Probabilidad | Impacto | Mitigación                                                                  |
| ---------------------------------------- | :----------: | :-----: | --------------------------------------------------------------------------- |
| Texturas/tiles con CORS o términos de uso | Media        | Media   | Esri dev no comercial; fallback MapTiler/AW Terrarium local; validar ToS.   |
| Fuga de VRAM por InstancedMesh reciclado  | Media        | Alta    | `dispose()` obligatorio (Fase 13); test de 100 toggles ×5 ciclos en CI.     |
| Rate-limit de FIRMS con `MAP_KEY`        | Media        | Media   | Caché Redis + fallback local + single-fetch por ventana (TTL 300 s).        |
| GRIB2 pesado (50–200 MB)                 | Media        | Media   | FastAPI recorta y sirve solo ArrayBuffers (Fase 1.8 opc.); Worker 3 procesa rejillas. |
| Rendimiento en GPU integradas            | Alta         | Alta    | LOD de tiles, cap DPR 2.0, presupuesto de draw calls, escenario de estrés.  |
| Cambios de ToS/URL de APIs externas      | Media        | Media   | URLs concentradas en `clients` + caché; fallback encadenado por módulo.     |
| `aioredis` en mantenimiento              | Alta         | Baja    | Baseline compat; opción `redis>=5` async con el mismo `REDIS_URL` ([Deployment §8.2](./GAIA_DEPLOYMENT.md)). |
| XSS vía campos upstream (`place`, `station_id`) | Media    | Alta    | React escaping + CSP nonce + `react/no-danger`; numeros formateados tipado. |

---

## 22. Mejoras Opcionales (Documentadas en Otros Docs, Fuera de los 14 RF)

Elementos ya definidos en la documentación pero **no obligatorios** para cumplir los 14 RF. Cada uno se implementaría como incremento tras cerrar su fase y tiene su paso "opcional" señalado dentro de la fase.

| Mejora                             | Fuente                              | Fase donde encaja            | Almacenaje en la matriz |
| ---------------------------------- | ----------------------------------- | ---------------------------- | ----------------------- |
| **EFFIS** (FWI + áreas quemadas)   | [Catálogo §1.2](./GAIA_DATA_SOURCES.md) | Fase 5 (Europa, enriquecimiento) | Capa bonus en HUD      |
| **GFW** (histórico forestal)       | [Catálogo §1.3](./GAIA_DATA_SOURCES.md) | Fase 5 (contexto ecológico) | Tooltip FireDetail     |
| **IRIS** (catálogos históricos)    | [Catálogo §2.3](./GAIA_DATA_SOURCES.md) | Fase 6 (fallback sismos)     | Fallback secundario    |
| **EMSC WebSocket** (sismos en vivo) | [Catálogo §2.2](./GAIA_DATA_SOURCES.md) | Fase 6.5                    | Feed de alertas        |
| **NOAA GFS** (GRIB2 0.25°)         | [Catálogo §3.2](./GAIA_DATA_SOURCES.md) | Fase 1.8 y 7.5              | Rejilla alternativa     |
| **ECMWF Open Data** (IFS)          | [Catálogo §3.3](./GAIA_DATA_SOURCES.md) | Fase 7 (fallback viento)     | Fallback secundario    |
| **GEBCO** (batimetría)             | [Catálogo §4.2](./GAIA_DATA_SOURCES.md) | Fase 4.7                    | Tallado de fosas        |
| **Copernicus DEM** (30 m costas)    | [Catálogo §4.3](./GAIA_DATA_SOURCES.md) | Fase 8.5                    | Máscara de inundación   |
| **NOAA Tides** (mareas en vivo)    | [Catálogo §4.4](./GAIA_DATA_SOURCES.md) | Fase 8.6                    | Referencia al slider    |
| **CelesTrak** (órbitas de satélites) | [Catálogo §5.1](./GAIA_DATA_SOURCES.md) | Fase 4+ (capas OSINT)        | Overlay satelital       |
| **OSM Overpass** (infraestructura crítica) | [Catálogo §5.3](./GAIA_DATA_SOURCES.md) | Fase 10 (capas OSINT)        | Overlay hospitales/puertos |
| **Heatmap radiológico esférico**    | [Spec RF-14](./GAIA_SPECIFICATION.md) | Fase 9.3                    | Vista densidad radiación |
| **Feed de alertas en tiempo real**  | [Spec §2.5](./GAIA_SPECIFICATION.md) | Fase 10.6                    | HUD: pila de alertas     |
| **Polígonos de placas/orogenias**   | [Catálogo §2.4](./GAIA_DATA_SOURCES.md) | Fase 4.8                    | Overlay placas          |

> [!IMPORTANT]
> Ninguna de estas mejoras debe retrasar el cierre de los 14 RF + 7 RNF (hito de demo presentable al final de la Fase 8; hito de desplegable al final de la Fase 15). Se incorporan solo si el presupuesto de tiempo (≈ 92 jornadas) lo permite.

---

## 23. Recomendación de Secuencia de Trabajo (por jornada corta)

Para mantener entregables constantes, se sugiere el siguiente ritmo de trabajo día a día:

1. **Fases 0–2** (proyecto en vertical): backend funcional + DB + contrato (≈ 3 semanas).
2. **Fase 4** (globo) en paralelo técnico con Fase 3 si hay doble foco; si no, secuencial.
3. **Fases 5–9** (módulos 3D) en orden de dependencia de datos: incendios → sismos → viento → agua → radiación (≈ 4 semanas).
4. **Fases 10–13** (interacción, robustez y rendimiento) puliendo la experiencia real (≈ 3 semanas).
5. **Fases 14–16** (calidad, despliegue, cierre) (≈ 2–3 semanas).

**Hito recomendado para "demo presentable":** final de la **Fase 8** (todas las capas básicas visibles + slider agua + telemetría básica aún sin time-scrubber completo). El proyecto queda "completo y desplegable" al final de la **Fase 15**.

---

*Este documento es la guía de ejecución maestra; complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md) y el resto de la documentación de GAIA.*
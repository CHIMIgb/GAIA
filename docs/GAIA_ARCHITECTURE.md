# GAIA — Arquitectura del sistema (F0-F1)

> **Proyecto:** GAIA 3D
> **Versión del Documento:** 1.1
> **Fecha:** 2026-09-28
> **Alcance:** Describe la arquitectura tal como está montada para las fases 0 y 1, con el flujo de datos que hoy corre de verdad. Complementa a la [Especificación Técnica](./GAIA_SPECIFICATION.md) §2 y al [Roadmap](./GAIA_ROADMAP.md) (fases F0 y F1). El porqué de cada tecnología está en [ADR-001](./adr/ADR-001-stack.md) y su justificación por capa, en el [Stack Tecnológico](./GAIA_TECH_STACK.md).

---

## Contenido

1. [Qué es este documento](#1-qué-es-este-documento)
2. [Diagrama de capas](#2-diagrama-de-capas)
3. [Mapa de módulos](#3-mapa-de-módulos)
4. [Flujo de datos de hoy](#4-flujo-de-datos-de-hoy)
5. [Frontera entre hilo principal y workers](#5-frontera-entre-hilo-principal-y-workers)
6. [Lo que añade F1](#6-lo-que-añade-f1)
7. [Lo que no está](#7-lo-que-no-está)
8. [Trazabilidad](#8-trazabilidad)

---

## 1. Qué es este documento

`GAIA_SPECIFICATION.md` §2 dice **qué debe ser** el sistema: cuatro capas acopladas por
eventos asíncronos y estructuras binarias. Este doc dice **qué hay** para F0 y F1, y
por tanto separa dos cosas que se confunden fácil:

| Doc                    | Responde a                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| `SPEC` §2              | Cómo tiene que ser la arquitectura                                    |
| `PROJECT_STRUCTURE` §2 | En qué carpetas vive el código                                        |
| **Este doc**           | Qué módulos existen ya, cuáles son plantilla y por dónde pasa el dato |

Los diagramas son ASCII como los de `SPEC` §2, para que se lean igual en un editor, en
un terminal y en el diff.

## 2. Diagrama de capas

Las cuatro capas de `SPEC` §2, con el estado real a 2026-09-28. `montado` es lo que
funciona hoy; `plantilla` es el esqueleto sin la lógica del módulo; `pendiente` es lo
que entra en F1.

```
+-------------------------------------------------------------------------------------+
| CAPA DE DATOS ABIERTOS                     NASA FIRMS / USGS / Open-Meteo / ...      |
| (SPEC §2.2)                                pendiente: entra con cada módulo, F2-F6   |
+--------------------------------------+----------------------------------------------+
                                       |  fetch() + reintentos + caché (WORKFLOWS)
                                       v
+-------------------------------------------------------------------------------------+
| CAPA DE COMPUTACIÓN (WEB WORKERS)            pendiente: W1, W2, W3                    |
| (SPEC §2.3)                                plantilla: template.worker.ts (0.4.3)     |
|                                            montado:  protocolo de mensajes + Comlink|
+--------------------------------------+----------------------------------------------+
                                       |  Transferable Objects, sin copias
                                       v
+-------------------------------------------------------------------------------------+
| CAPA DE RENDERIZADO GPU (THREE.JS)        pendiente: F1. three no está instalado     |
| (SPEC §2.4)                                no hay escena, ni renderer, ni shaders    |
+--------------------------------------+----------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------------+
| CAPA DE INTERFAZ TÁCTICA (HUD)            montado:  DevOverlay, solo en dev         |
| (SPEC §2.5)                                montado:  store Valtio + acciones         |
|                                            pendiente: toggles, time-scrubber, feed |
+-------------------------------------------------------------------------------------+

+-------------------------------------------------------------------------------------+
| API (FastAPI)                               montado:  contrato, sesión, rate-limit,  |
| DEPLOYMENT §3 / API_CONTRACT                seguridad, caché Redis, log de acceso   |
+-------------------------------------------------------------------------------------+
```

El backend no es una quinta capa del diagrama de `SPEC` §2: es la capa de datos
abiertos por el lado servidor. `SPEC` §2 lo describe de una sentada (el `fetch()` con
reintentos y la caché) y lo que sí tiene entidad propia es la API que consume el
frontend, con su contrato y su middleware.

## 3. Mapa de módulos

Cada módulo, su capa, su fichero y en qué estado está. "Fichero" es la ruta real: el
mapa completo está en `PROJECT_STRUCTURE` §2 y aquí no se repite.

### 3.1 API (FastAPI)

| Módulo           | Capa           | Fichero                                      | Estado                             |
| ---------------- | -------------- | -------------------------------------------- | ---------------------------------- |
| App y lifespan   | API            | `backend/app/main.py`                        | montado (0.2.1)                    |
| Router de health | API            | `backend/app/routers/health.py`              | montado (0.2.1)                    |
| Sesión anónima   | API            | `backend/app/services/session.py`            | montado (0.3.2)                    |
| Rate limit       | API            | `backend/app/middleware/rate_limit.py`       | montado (0.2.3)                    |
| Access log       | API            | `backend/app/middleware/access_log.py`       | montado (0.3.3)                    |
| Cabeceras y CSP  | API            | `backend/app/middleware/security_headers.py` | montado (0.4.5)                    |
| Cliente Redis    | Caché          | `backend/app/cache/redis_client.py`          | montado (0.2.2)                    |
| Sesión en Redis  | Caché          | `backend/app/services/session.py`            | montado (0.3.2)                    |
| Cliente HTTP     | Datos abiertos | `backend/app/services/http_client.py`        | montado (0.6.3)                    |
| Sesión en BD     | Persistencia   | `backend/app/db/session_store.py`            | montado (0.3.2)                    |
| Log de API       | Persistencia   | `backend/app/db/api_log_store.py`            | montado (0.4.3)                    |
| Migraciones      | Persistencia   | `backend/alembic/`                           | montado (0.3.1)                    |
| Módulos de datos | Datos abiertos | —                                            | pendiente: F2-F6, uno por endpoint |

### 3.2 Frontend

| Módulo              | Capa          | Fichero                                   | Estado                            |
| ------------------- | ------------- | ----------------------------------------- | --------------------------------- |
| Shell de la app     | HUD           | `frontend/src/App.tsx`                    | scaffold de Vite, sin el HUD real |
| Cliente de API      | API (consumo) | `frontend/src/services/api.ts`            | montado (0.4.2)                   |
| Store de estado     | HUD           | `frontend/src/store/index.ts`             | montado (0.4.1)                   |
| Acciones del store  | HUD           | `frontend/src/store/actions.ts`           | montado (0.4.1)                   |
| Tipos del estado    | HUD           | `frontend/src/store/state.types.ts`       | montado (0.4.1)                   |
| Overlay de dev      | HUD           | `frontend/src/components/DevOverlay.tsx`  | montado (0.7.1), solo en dev      |
| Contador de frames  | HUD           | `frontend/src/utils/frameStats.ts`        | montado (0.7.1)                   |
| Plantilla de worker | Computación   | `frontend/src/workers/template.worker.ts` | montado (0.4.3)                   |
| Protocolo de worker | Computación   | `frontend/src/workers/worker.types.ts`    | montado (0.4.3)                   |
| Escena 3D           | GPU           | —                                         | pendiente: F1                     |
| Shaders             | GPU           | —                                         | pendiente: F1                     |

`App.tsx` sigue siendo la pantalla de bienvenida de Vite, con su contador: los
componentes del HUD que aparecen en los tests (`StatusBadge`, `LayerToggle`,
`TelemetryPanel`) están definidos dentro del propio fichero de test, no en `src/`. El
HUD de `SPEC` §2.5 no existe todavía.

## 4. Flujo de datos de hoy

Lo que hace una petición real de punta a punta. Solo hay un endpoint, `/api/health`
(0.2.1); el resto de la tubería está montada y probada, pero sin módulos de datos que
la usen todavía.

```
navegador
   |  fetchAPI() desde services/api.ts (0.4.2), con timeout propio y AbortController
   |  nunca formatea el cuerpo a mano: parsea data o lanza GaiaAPIError
   v
Vite dev server (:5173)  --proxy-->  uvicorn (:8000)
   |
   v
SecurityHeadersMiddleware      <- la más externa: sus headers llegan a los 4xx y 429
   |
   v
CORSMiddleware                 <- fuera del rate-limit: un preflight no gasta cuota
   |
   v
AccessLogMiddleware            <- registra el estado que sale de verdad
   |
   v
RateLimitMiddleware            <- token bucket en Redis; si Redis cae, fail-open (0.6.8)
   |
   v
SessionMiddleware              <- cookie `gaia_session`; en Redis y en BD solo su sha256
   |
   v
routers/health.py  -->  services/timing.py  -->  cache/redis_client.py  -->  PING
   |
   v
models/response.py             <- { success, data, error } en las dos direcciones
   |
   v
handlers de excepción de main.py: validación, HTTP y 500 sin manejar
   |
   v
navegador  -->  store/actions.ts  -->  Valtio  -->  React
```

Lo que **no** ocurre todavía: nada de esto devuelve datos de un módulo. El consumidor
es el store, que sabe distinguir `live` de `error` y guardar el mensaje del contrato
(el camino `live` lo ata el smoke E2E de 0.6.9), pero el único módulo que hay es
`health`.

## 5. Frontera entre hilo principal y workers

El protocolo de mensajes está fijado por `PROJECT_STRUCTURE` §5.4 y `TESTING` §6.3, y
`workers/worker.types.ts` lo implementa entero: los cuatro mensajes
(`FIRES_READY`, `QUAKES_READY`, `WIND_READY`, `RADIATION_READY`), el `Float32Array`
de cada uno y `transferablesOf()`.

Dos reglas que ya están en el código y que conviene no romper al escribir W1-W3:

- **Los workers no tocan el store.** Devuelven datos y es el hilo principal quien
  muta `state` (`STATE` §4).
- **Se transfiere el `ArrayBuffer`, no el typed array.** `postMessage` solo acepta
  `ArrayBuffer` y `MessagePort`; un `Float32Array` se clonaría en silencio, que es
  justo el cero-copia que `SPEC` §2.3 quiere.

Lo que falta es la otra mitad: los workers W1, W2 y W3, y el `wrap()` de Comlink que
levanta la instancia. La plantilla expone una API (`echo`) para tener el esqueleto
probado sin la lógica de ningún módulo.

## 6. Lo que añade F1

F1 mete la capa GPU, que hoy está a cero: `three` ni siquiera está en
`frontend/package.json`. Lo que entra, según el roadmap y `GLOBE_TEXTURES`:

| Pieza          | Qué es                                          | De dónde sale el dato      |
| -------------- | ----------------------------------------------- | -------------------------- |
| Globo base     | Esfera con textura satelital                    | Esri (`GLOBE_TEXTURES` §1) |
| Atmósfera      | Shader de dispersión en el borde del limbo      | —                          |
| Elevación      | Heightmap displacement sobre la esfera          | Terrarium/AWS (`§2`)       |
| Altimetría     | Puntos sueltos sobre la superficie              | Open-Meteo (`§3`)          |
| LOD            | Anillos de detalle según la distancia de cámara | ROADMAP F1                 |
| Cámara orbital | Órbita y zoom, en el hilo principal             | ROADMAP F1                 |

Lo que la capa GPU **no** cambia: el contrato de la API, el store ni la regla de que
quien muta Three.js no pasa por Valtio (`STATE` §4).

## 7. Lo que no está

Para que nadie lo dé por montado:

- **Capa GPU: cero.** Sin `three`, sin escena, sin renderer, sin shaders, sin cámara.
- **Workers W1, W2 y W3: no existen.** Solo la plantilla y el protocolo.
- **Módulos de datos: ninguno.** `/api/health` es el único endpoint; `/api/fires`,
  `/api/earthquakes`, `/api/wind` y `/api/radiation` entran en F2-F6.
- **HUD: solo el overlay de dev.** `App.tsx` es el scaffold de Vite.
- **Caché de módulos y quotas por módulo:** el rate limit es el global
  (`SECURITY` §4.2); el por módulo entra con F2.

## 8. Trazabilidad

| Pieza de este doc               | Fuente                                   |
| ------------------------------- | ---------------------------------------- |
| Las cuatro capas                | `SPEC` §2, §2.2-§2.5                     |
| Módulos de datos y endpoints    | `API_CONTRACT` §2 y §4, `ROADMAP` F2-F6  |
| Mensajes de worker              | `PROJECT_STRUCTURE` §5.4, `TESTING` §6.3 |
| Regla de mutación de Three.js   | `STATE` §4                               |
| Texturas del globo              | `GLOBE_TEXTURES` §1-§4                   |
| Rate limit y sus valores        | `SECURITY` §4.2                          |
| Puesta en marcha de lo anterior | `DEPLOYMENT` §3                          |

---

_Este documento complementa a la [Especificación Técnica](./GAIA_SPECIFICATION.md) §2 y
al [Plan de Testing](./GAIA_TESTING.md) del proyecto GAIA._

# GAIA — Visualizador Geoespacial 3D en Tiempo Real

> Plataforma de monitoreo ambiental que integra incendios, sismos, viento, inundaciones y radiación sobre un globo terráqueo interactivo renderizado con WebGL/Three.js a 60 FPS.

---

## Documentación

| Documento                                                           | Descripción                                                                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Especificación Técnica](docs/GAIA_SPECIFICATION.md)                | Arquitectura de 4 capas, 14 requisitos funcionales (7 subsistemas) y 7 requisitos no funcionales.                                                                                        |
| [Arquitectura del Sistema](docs/GAIA_ARCHITECTURE.md)               | Arquitectura de F0-F1 tal como está montada: módulos por capa, flujo de datos real y lo que aún no existe.                                                                               |
| [Guía de Contribución](docs/GAIA_CONTRIBUTING.md)                   | Flujo de contribución: el bucle de un micro-paso, los comandos que existen y las reglas de los docs.                                                                                     |
| [Changelog y versionado](docs/GAIA_CHANGELOG.md)                    | SemVer y Keep a Changelog: una sección por fase, versión compartida por los cinco sitios y etiquetado al cerrar cada fase.                                                               |
| [Stack Tecnológico](docs/GAIA_TECH_STACK.md)                        | TypeScript, Vite, Three.js + GLSL, React, Valtio, Web Workers + Comlink, FastAPI, Tailwind CSS — con justificación de cada elección.                                                     |
| [ADR-001 — Decisión de stack](docs/adr/ADR-001-stack.md)            | Registro de decisión: qué tecnología se usa en cada capa, qué alternativas se descartaron y qué queda sin documentar.                                                                    |
| [Contrato de API](docs/GAIA_API_CONTRACT.md)                        | Formato universal JSON `{ success, data, error }` para toda comunicación frontend ↔ backend.                                                                                             |
| [Workflows Funcionales](docs/GAIA_WORKFLOWS.md)                     | 8 flujos de trabajo detallados: inicialización, incendios, viento, sismos, inundación, interacción, resiliencia y radiación.                                                             |
| [Catálogo de APIs](docs/GAIA_DATA_SOURCES.md)                       | 21 APIs y fuentes de datos gratuitas organizadas por módulo funcional.                                                                                                                   |
| [APIs del Globo](docs/GAIA_GLOBE_TEXTURES.md)                       | Textura satelital (Esri), heightmaps DEM (Terrarium) y altimetría puntual (Open-Meteo).                                                                                                  |
| [Estructura del Proyecto](docs/GAIA_PROJECT_STRUCTURE.md)           | Mapa de carpetas y archivos del monorepo (frontend + backend).                                                                                                                           |
| [Estado Global (Valtio)](docs/GAIA_STATE.md)                        | Forma del estado, reglas de mutación Three.js vs React y catálogo de acciones.                                                                                                           |
| [Plan de Testing](docs/GAIA_TESTING.md)                             | Métricas de rendimiento, pruebas de memoria GPU, resiliencia de red y compatibilidad.                                                                                                    |
| [Guía de Despliegue](docs/GAIA_DEPLOYMENT.md)                       | Desarrollo local, Docker, CI/CD, variables de entorno y versiones del stack.                                                                                                             |
| [Seguridad](docs/GAIA_SECURITY.md)                                  | Rate limiting, protección DDoS, XSS, sesiones por cookie sin cuentas y endurecimiento.                                                                                                   |
| [Base de Datos](docs/GAIA_DATABASE.md)                              | Postgres/TimescaleDB para históricos, ingesta, API de consulta y evaluación de sesiones.                                                                                                 |
| [Roadmap de Desarrollo](docs/GAIA_ROADMAP.md)                       | 14 fases incrementales: construcción de un módulo a la vez (de extremo a extremo) con pasos pequeños, criterios de aceptación y trazabilidad RF/RNF.                                     |
| [Identidad Visual y Diseño de Interfaz](docs/GAIA_VISUAL_DESIGN.md) | Estilo minimalista de GAIA: paleta orbital, tipografía, iconografía de línea, layout centrado en el planeta y movimiento.                                                                |
| [Recomendaciones Técnicas](docs/GAIA_RECOMENDACIONES.md)            | Auditoría objetiva de la documentación: fortalezas, deudas técnicas y recomendaciones accionables priorizadas (P0–P3).                                                                   |
| [Performance](docs/GAIA_PERFORMANCE.md)                             | Presupuestos y baselines de rendimiento: FPS, p95, draw calls, FCP y bundle. Referencia los valores canónicos de SPEC/TESTING/ROADMAP §17 y marca `PENDIENTE` lo que aún no está fijado. |
| [Definición de Terminado (DoD)](docs/GAIA_DOD.md)                   | Checklist con el que se da por terminado un micro-paso: criterio verificado, test que ata el comportamiento, mutación, suite en verde y commit.                                          |

---

## Estado

**Fase 0 en curso**: 60 de sus 66 micro-pasos validados. Quedan 6: `0.7.5` y `0.7.13`
(los dos bloqueados por huecos de documentación, explicados más abajo) y `0.8.12` a
`0.8.15`, que son el cierre de documentación de la fase. Las fases F1 a F13 no han
empezado: 266 micro-pasos.

Lo validado hasta ahora demuestra el contrato universal `{ success, data, error }`, el
rate-limit con token bucket, las sesiones anónimas sin PII, los headers de seguridad,
la cobertura por fase en CI, el baseline de rendimiento con gate de regresión y el flujo
base E2E.

Los dos pasos de F0 sin manera de cumplirse hoy, y por qué:

- **`0.7.5` (presupuesto de assets)**: ningún doc fija los presupuestos de tamaño de
  textura, heightmap o shader. Queda `PENDIENTE` en vez de inventar cifras.
- **`0.7.13` (p95 de frame por capa en dev)**: el overlay mide el p95 global, y las
  cinco capas que el criterio exige todavía no existen (se montan en F1-F6).

Detalle de fases, criterios de aceptación y trazabilidad RF/RNF en el
[Roadmap](docs/GAIA_ROADMAP.md) §16. Puesta en marcha en la
[Guía de Despliegue](docs/GAIA_DEPLOYMENT.md) §3.

---

## Mapa de fases

**14 fases, 88 grupos y 332 micro-pasos** (~94 jornadas de 6 h). Cada fase cierra con un
hito verificable y su propio PR a `main`. Los nombres son los de los encabezados del
[Roadmap](docs/GAIA_ROADMAP.md), sin el sufijo repetido «— Corte Vertical Completo» de F2
a F6; allí está el detalle de cada paso, su criterio de aceptación y su estimado.

| Fase                                                                                                         | Nombre                                              | Micro-pasos | Estado                      |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------: | --------------------------- |
| [F0](docs/GAIA_ROADMAP.md#2-fase-0--fundación-y-plataforma-compartida)                                       | Fundación y Plataforma Compartida                   |          66 | **En curso** — 60 validados |
| [F1](docs/GAIA_ROADMAP.md#3-fase-1--motor-3d-y-globo-terráqueo)                                              | Motor 3D y Globo Terráqueo                          |          32 | Pendiente                   |
| [F2](docs/GAIA_ROADMAP.md#4-fase-2--módulo-incendios-nasa-firms--corte-vertical-completo)                    | Módulo Incendios (NASA FIRMS)                       |          30 | Pendiente                   |
| [F3](docs/GAIA_ROADMAP.md#5-fase-3--módulo-sismos-usgs--corte-vertical-completo)                             | Módulo Sismos (USGS)                                |          27 | Pendiente                   |
| [F4](docs/GAIA_ROADMAP.md#6-fase-4--módulo-viento-open-meteo--gpu--corte-vertical-completo)                  | Módulo Viento (Open-Meteo + GPU)                    |          33 | Pendiente                   |
| [F5](docs/GAIA_ROADMAP.md#7-fase-5--módulo-inundación-nivel-del-mar--corte-vertical-completo)                | Módulo Inundación (Nivel del Mar)                   |          21 | Pendiente                   |
| [F6](docs/GAIA_ROADMAP.md#8-fase-6--módulo-radiación-safecast-eurdep-radnet-gmcmap--corte-vertical-completo) | Módulo Radiación (Safecast, EURDEP, RadNet, GMCMap) |          22 | Pendiente                   |
| [F7](docs/GAIA_ROADMAP.md#9-fase-7--hud-analítico-interacción-y-time-scrubber)                               | HUD Analítico, Interacción y Time-Scrubber          |          20 | Pendiente                   |
| [F8](docs/GAIA_ROADMAP.md#10-fase-8--resiliencia-end-to-end-y-modo-resguardo)                                | Resiliencia End-to-End y Modo Resguardo             |           9 | Pendiente                   |
| [F9](docs/GAIA_ROADMAP.md#11-fase-9--seguridad-y-privacidad-hardening)                                       | Seguridad y Privacidad (Hardening)                  |          20 | Pendiente                   |
| [F10](docs/GAIA_ROADMAP.md#12-fase-10--optimización-60-fps-y-memoria-gpu)                                    | Optimización 60 FPS y Memoria GPU                   |          15 | Pendiente                   |
| [F11](docs/GAIA_ROADMAP.md#13-fase-11--testing-integral-compatibilidad-y-cicd)                               | Testing Integral, Compatibilidad y CI/CD            |          14 | Pendiente                   |
| [F12](docs/GAIA_ROADMAP.md#14-fase-12--despliegue-monitoreo-y-operaciones)                                   | Despliegue, Monitoreo y Operaciones                 |          14 | Pendiente                   |
| [F13](docs/GAIA_ROADMAP.md#15-fase-13--pulido-final-docs-y-demostración)                                     | Pulido Final, Docs y Demostración                   |           9 | Pendiente                   |

---

## Puesta en marcha

Versiones, detalle de cada paso y los `docker run` de Redis y PostgreSQL en
[Despliegue](docs/GAIA_DEPLOYMENT.md) §3.

| Herramienta | Versión | Para qué                            |
| ----------- | ------- | ----------------------------------- |
| Node.js     | 22 LTS  | Vite, Vitest, Playwright            |
| Python      | 3.12    | FastAPI, Uvicorn, tests             |
| uv          | 0.5+    | Entorno y dependencias del backend  |
| Redis       | 7.x     | Caché                               |
| PostgreSQL  | 18      | Base de datos e historial (Alembic) |
| Docker      | 24+     | Opcional, solo para Redis           |

```bash
git clone <url-del-repo> && cd GAIA

# Dependencias. npm va desde la raíz porque el repo son workspaces (frontend y
# shared); uv desde backend/, que es un proyecto uv propio con su uv.lock.
npm ci
cd backend && uv sync && cd ..

# Variables: el backend lee .env desde su propio directorio (Settings, env_file).
cp .env.example backend/.env      # cambiar DATABASE_URL por la clave real

# La migración necesita la BD y el rol dedicados ya creados; los `createdb` y
# `psql` están en DEPLOYMENT §3.2, paso 2. Sin eso, alembic sale con
# ConnectionRefusedError contra el 5432.
cd backend && uv run alembic upgrade head && cd ..
```

Las variables del backend están todas en `.env.example`, que es la plantilla
versionada: cada una sale con su valor por defecto y el doc que la fija. Las del
frontend van en `frontend/.env.local` y solo se leen del bundle si empiezan por
`VITE_` (`DEPLOYMENT` §4.3).

```bash
# Backend, en una terminal
cd backend && uv run uvicorn app.main:app --reload --port 8000

# Frontend, en otra
npm run dev                        # http://localhost:5173
```

Comprobar que está en pie:

```bash
curl http://localhost:8000/api/health    # {"success": true, "data": {...}, "error": null}
npm test                                # unit de los scripts de la raíz y del frontend
```

### Scripts

Todos desde la raíz, menos los que llevan `-w frontend` o `cd backend`.

| Script                           | Qué hace                                           |
| -------------------------------- | -------------------------------------------------- |
| `npm run dev`                    | Vite en el 5173 con HMR                            |
| `npm run build`                  | `tsc -b` y build de producción                     |
| `npm test`                       | Unit de los scripts de la raíz y del frontend      |
| `npm run test:e2e -w frontend`   | Smoke E2E; levanta Vite y uvicorn                  |
| `npm run lint`                   | oxlint, con `--deny-warnings`                      |
| `npm run lint:imports`           | ESLint: orden de imports y boundaries de `shared/` |
| `npm run typecheck`              | `tsc -b` de `shared`                               |
| `npm run coverage`               | Cobertura por fase (`PERFORMANCE`, paso 0.7.10)    |
| `npm run perf:check`             | Presupuesto de bundle                              |
| `npm run perf:baseline`          | Compara el bundle con el baseline guardado         |
| `npm run analyze -w frontend`    | Treemap de chunks en `dist/stats.html`             |
| `npm run fcp -w frontend`        | FCP con la red 4G de `TESTING` §3.3                |
| `cd backend && uv run pytest -q` | Tests del backend                                  |

Mapa de carpetas en [Estructura del Proyecto](docs/GAIA_PROJECT_STRUCTURE.md) §2.

---

## Stack

| Capa     | Tecnología                                    |
| -------- | --------------------------------------------- |
| Lenguaje | TypeScript (strict)                           |
| Bundler  | Vite                                          |
| Motor 3D | Three.js + GLSL                               |
| UI       | React + Tailwind CSS                          |
| Estado   | Valtio                                        |
| Workers  | Web Workers + Comlink                         |
| Backend  | FastAPI + Redis + PostgreSQL 18 / TimescaleDB |

## Rendimiento

Cifras medidas hoy sobre el scaffold, no objetivos. El detalle, el método y la
fecha de cada medición están en [Performance](docs/GAIA_PERFORMANCE.md) §4, que es
donde viven los números: aquí se copian para que se vean de entrada, y cada
columna dice de qué doc sale cada una.

| Medida                   | Baseline | Objetivo          | Fuente del baseline | Fuente del objetivo           |
| ------------------------ | -------- | ----------------- | ------------------- | ----------------------------- |
| JS inicial (gzip)        | 66.8 KiB | ≤ 450 KB          | `PERFORMANCE` §4.1  | `TESTING` §3.4                |
| Chunk de arranque (gzip) | 66.8 KiB | ≤ 180 KB          | `PERFORMANCE` §4.1  | `TESTING` §3.4                |
| CSS (gzip)               | 1.44 KiB | sin límite fijado | `PERFORMANCE` §4.1  | —                             |
| FCP (mediana de 3)       | 352 ms   | < 2 s             | `PERFORMANCE` §4.2  | `SPEC` RNF-06, `TESTING` §3.1 |

- **Cómo se reproducen:** `npm run perf:check` para el bundle, `npm run fcp` para el
  FCP. El bundle se comprueba en cada CI; el FCP se mide cuando se toca lo que le
  afecta.
- **Baseline no es presupuesto.** El presupuesto dice si se pasa; el baseline dice
  si se ha empeorado. Cuando se mida otra vez se anota la diferencia contra esta
  cifra, no contra el objetivo.
- **Sin baseline todavía:** FPS, p95 de frame y draw calls dan `n/d` hasta que exista
  la escena (fase 1). Sus objetivos ya están fijados en `PERFORMANCE` §2.

## Fuentes de Datos

NASA FIRMS · USGS Earthquakes · Open-Meteo · AWS Terrarium · Esri World Imagery · Safecast · EURDEP · EPA RadNet · GMCMap · GEBCO · Natural Earth

---

## Licencia

Pendiente de definir.

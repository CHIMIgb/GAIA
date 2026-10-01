# GAIA — Visualizador Geoespacial 3D en Tiempo Real

> **GAIA** — _Geospatial Atmospheric & Environmental Intelligence Architecture_.

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

**F0 cerrada con 2 excepciones** (64 de 66 micro-pasos validados) y **F1 en curso**:
`1.1.1`, `1.1.2` y `1.2.1` realizados, `1.2.1` pendiente de validación — quedan 29 de
los 32 de la fase. F2 a F13 no han empezado: 234 micro-pasos.

Lo validado hasta ahora demuestra el contrato universal `{ success, data, error }`, el
rate-limit con token bucket, las sesiones anónimas sin PII, los headers de seguridad,
la cobertura por fase en CI, el baseline de rendimiento con gate de regresión y el flujo
base E2E. En F1, el globo 3D con cámara orbital y el geoide de radio 1.

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

**14 fases, 88 grupos y 333 micro-pasos** (~96 jornadas de 6 h). Cada fase cierra con un
hito verificable y su propio PR a `main`. Los nombres son los de los encabezados del
[Roadmap](docs/GAIA_ROADMAP.md), sin el sufijo repetido «— Corte Vertical Completo» de F2
a F6; allí está el detalle de cada paso, su criterio de aceptación y su estimado.

| Fase                                                                                                         | Nombre                                              | Micro-pasos | Estado                                       |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------: | -------------------------------------------- |
| [F0](docs/GAIA_ROADMAP.md#2-fase-0--fundación-y-plataforma-compartida)                                       | Fundación y Plataforma Compartida                   |          66 | **Cerrada con 2 excepciones** — 64 validados |
| [F1](docs/GAIA_ROADMAP.md#3-fase-1--motor-3d-y-globo-terráqueo)                                              | Motor 3D y Globo Terráqueo                          |          32 | En curso — 1.1.x validados, 1.2.1 pendiente  |
| [F2](docs/GAIA_ROADMAP.md#4-fase-2--módulo-incendios-nasa-firms--corte-vertical-completo)                    | Módulo Incendios (NASA FIRMS)                       |          30 | Pendiente                                    |
| [F3](docs/GAIA_ROADMAP.md#5-fase-3--módulo-sismos-usgs--corte-vertical-completo)                             | Módulo Sismos (USGS)                                |          27 | Pendiente                                    |
| [F4](docs/GAIA_ROADMAP.md#6-fase-4--módulo-viento-open-meteo--gpu--corte-vertical-completo)                  | Módulo Viento (Open-Meteo + GPU)                    |          33 | Pendiente                                    |
| [F5](docs/GAIA_ROADMAP.md#7-fase-5--módulo-inundación-nivel-del-mar--corte-vertical-completo)                | Módulo Inundación (Nivel del Mar)                   |          21 | Pendiente                                    |
| [F6](docs/GAIA_ROADMAP.md#8-fase-6--módulo-radiación-safecast-eurdep-radnet-gmcmap--corte-vertical-completo) | Módulo Radiación (Safecast, EURDEP, RadNet, GMCMap) |          22 | Pendiente                                    |
| [F7](docs/GAIA_ROADMAP.md#9-fase-7--hud-analítico-interacción-y-time-scrubber)                               | HUD Analítico, Interacción y Time-Scrubber          |          20 | Pendiente                                    |
| [F8](docs/GAIA_ROADMAP.md#10-fase-8--resiliencia-end-to-end-y-modo-resguardo)                                | Resiliencia End-to-End y Modo Resguardo             |           9 | Pendiente                                    |
| [F9](docs/GAIA_ROADMAP.md#11-fase-9--seguridad-y-privacidad-hardening)                                       | Seguridad y Privacidad (Hardening)                  |          20 | Pendiente                                    |
| [F10](docs/GAIA_ROADMAP.md#12-fase-10--optimización-60-fps-y-memoria-gpu)                                    | Optimización 60 FPS y Memoria GPU                   |          15 | Pendiente                                    |
| [F11](docs/GAIA_ROADMAP.md#13-fase-11--testing-integral-compatibilidad-y-cicd)                               | Testing Integral, Compatibilidad y CI/CD            |          14 | Pendiente                                    |
| [F12](docs/GAIA_ROADMAP.md#14-fase-12--despliegue-monitoreo-y-operaciones)                                   | Despliegue, Monitoreo y Operaciones                 |          14 | Pendiente                                    |
| [F13](docs/GAIA_ROADMAP.md#15-fase-13--pulido-final-docs-y-demostración)                                     | Pulido Final, Docs y Demostración                   |           9 | Pendiente                                    |

---

## Puesta en marcha

Hay tres niveles, del más corto al más explícito. El detalle de cada paso, los servicios
y las variables están en [Despliegue](docs/GAIA_DEPLOYMENT.md) §3.

| Herramienta | Versión | Para qué                            |
| ----------- | ------- | ----------------------------------- |
| Node.js     | 22 LTS  | Vite, Vitest, Playwright            |
| Python      | 3.12    | FastAPI, Uvicorn, tests             |
| uv          | 0.5+    | Entorno y dependencias del backend  |
| Redis       | 7.x     | Caché                               |
| PostgreSQL  | 18      | Base de datos e historial (Alembic) |
| Docker      | 24+     | Opcional, solo para Redis           |

### Nivel 1 — Un solo comando (Redis + backend + frontend)

```bash
git clone <url-del-repo> && cd GAIA
npm ci                                # workspaces: instala frontend/ y shared/
npm run dev:all
```

`dev:all` levanta Redis con Docker si el 6379 está libre, uvicorn en el 8000 y Vite en
el 5173, y para los tres con `Ctrl+C`. Si un proceso se cae, para los otros en vez de
dejarlos huérfanos ocupando el puerto.

Es `scripts/dev.mjs`, sin dependencias nuevas. **No redefine `npm run dev`**: ese sigue
siendo solo el frontend, como fijan `GAIA_CONTRIBUTING.md` y `GAIA_DEPLOYMENT.md` §3.2
("la API va aparte, en el 8000").

Lo que `dev:all` **no** hace, porque `DEPLOYMENT` §3.2 lo fija nativo y fuera de Docker
y porque el backend arranca sin él: crear la BD y el rol de PostgreSQL, y correr
`alembic upgrade head`. Sin eso no hay historial, y el resto funciona.

### Nivel 2 — Solo el globo (sin backend)

El frontend todavía no llama a la API: el cliente de `frontend/src/services/api.ts`
existe pero ningún módulo lo usa porque los datos se cablean en F2-F6. Para ver la
esfera y orbitarla basta con:

```bash
npm run dev                           # http://localhost:5173
```

Vite con HMR; recargar la página basta para volver a aplicar un cambio.

### Nivel 3 — A mano, paso a paso

Lo mismo que `dev:all`, proceso a proceso, para cuando se quiere ver o tocar cada
pieza. Redis y PostgreSQL:

```bash
# Redis (Docker o nativo en :6379)
docker run -d --rm -p 6379:6379 --name gaia-redis redis:7-alpine

# PostgreSQL 18 nativo (NO en Docker) con la BD y el rol dedicados
# GAIA_DATABASE.md §6.3 — el firewall de Windows corta el tráfico WSL → 5432,
# así que el backend se levanta desde Windows si la BD es local.
createdb -U postgres gaia            # una vez
psql -U postgres -c "CREATE ROLE gaia LOGIN PASSWORD '<clave>'"
psql -U postgres -c "ALTER DATABASE gaia OWNER TO gaia"
```

Backend y frontend, en dos terminales:

```bash
# El backend lee .env desde su propio directorio (Settings, env_file).
cp .env.example backend/.env          # cambiar DATABASE_URL por la clave real
cd backend && uv run alembic upgrade head   # crea el esquema (GAIA_DATABASE.md §6.4)
cd backend && uv run uvicorn app.main:app --reload --port 8000
```

```bash
npm run dev                            # http://localhost:5173, en la otra terminal
```

Comprobar que está en pie:

```bash
curl http://localhost:8000/api/health   # {"success": true, "data": {...}, "error": null}
npm run perf:check                      # presupuesto de bundle
npm test                                # unit de los scripts de la raíz y del frontend
```

> [!NOTE]
> En Windows, `uv` puede no estar en el `PATH` de la terminal aunque esté instalado
> para tu usuario. `uv sync`, `uv run` y `dev:all` fallan con "no se reconoce"; hay
> que instalarlo para el usuario o añadir su carpeta al `PATH`, y reabrir la terminal.

> [!NOTE]
> Las variables del backend están todas en `.env.example`, que es la plantilla
> versionada: cada una sale con su valor por defecto y el doc que la fija. El
> frontend no necesita ninguna hoy; cuando haga falta, van en `frontend/.env.local`
> y solo se leen del bundle si empiezan por `VITE_` (`DEPLOYMENT` §4.3).

### Scripts

Todos desde la raíz, menos los que llevan `-w frontend` o `cd backend`.

| Script                           | Qué hace                                           |
| -------------------------------- | -------------------------------------------------- |
| `npm run dev:all`                | Redis + backend + frontend a la vez (Ctrl+C para)  |
| `npm run dev`                    | Solo Vite en el 5173 con HMR                       |
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

| Medida                   | Baseline   | Objetivo          | Fuente del baseline | Fuente del objetivo           |
| ------------------------ | ---------- | ----------------- | ------------------- | ----------------------------- |
| JS inicial (gzip)        | 198.99 KiB | ≤ 450 KB          | `PERFORMANCE` §4.1  | `TESTING` §3.4                |
| Chunk de arranque (gzip) | 67.88 KiB  | ≤ 180 KB          | `PERFORMANCE` §4.1  | `TESTING` §3.4                |
| Chunk de Three.js (gzip) | 131.39 KiB | sin límite fijado | `PERFORMANCE` §4.1  | —                             |
| CSS (gzip)               | 0.35 KiB   | sin límite fijado | `PERFORMANCE` §4.1  | —                             |
| FCP (mediana de 3)       | 352 ms     | < 2 s             | `PERFORMANCE` §4.2  | `SPEC` RNF-06, `TESTING` §3.1 |

- **Cómo se reproducen:** `npm run perf:check` para el bundle, `npm run fcp` para el
  FCP. El bundle se comprueba en cada CI; el FCP se mide cuando se toca lo que le
  afecta.
- **Baseline no es presupuesto.** El presupuesto dice si se pasa; el baseline dice
  si se ha empeorado. Cuando se mida otra vez se anota la diferencia contra esta
  cifra, no contra el objetivo.
- **FPS y p95 sin baseline todavía.** **Draw calls ya los hay: 1**, la atmósfera de 1.2.2
  entra como shader de la misma malla y no suma ninguno. FPS y p95 no se pueden medir
  aquí: esta máquina no tiene GPU y Chromium rasteriza por software. Sus objetivos ya
  están fijados en `PERFORMANCE` §2 y la cifra buena la tiene que dar una máquina con GPU
  (`TESTING` §3).

## Fuentes de Datos

NASA FIRMS · USGS Earthquakes · Open-Meteo · AWS Terrarium · Esri World Imagery · Safecast · EURDEP · EPA RadNet · GMCMap · GEBCO · Natural Earth

---

## Licencia

Pendiente de definir.

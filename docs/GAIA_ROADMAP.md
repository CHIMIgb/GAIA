# GAIA Roadmap de Desarrollo — Plan de Trabajo

> **Versión del Documento:** 1.87
> **Estado:** En ejecución — Fase 0 en curso. Convención de marca: `- [x]` = paso validado; un paso realizado y aún sin validar lleva `- [ ]` con el sufijo _*(realizado, pendiente de validación)*_.
> **Última actualización:** 2026-09-28
> **Autor:** Documento de planificación para el desarrollo de GAIA, un portfolio fullstack.

## 1. Introducción y Método

Este es el **mapa de trabajo** para construir GAIA de forma **incremental y con control de alcance**. Cada fase termina en un **entregable visible** (contrato universal, globo 3D, o un módulo de datos end-to-end funcionando + datos reales). El documento de referencia técnico es [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md).

### 1.1 Principios del plan

1. **Cada fase termina en algo visible.** Las primeras fases (0-1) son la plataforma; desde la Fase 2 en adelante entregamos **módulos completos de extremo a extremo** (backend + datos reales + 3D + HUD).
2. **Patrón de módulo (Fases 2-6).** Todos los módulos siguen el mismo patrón: Backend → Persistencia → Worker → Renderizado 3D → HUD → (Opcionales). Esto permite avanzar en paralelo y mantener una base coherente.
3. **Los valores técnicos viven en el doc técnico.** Aquí no se repiten las tablas; se referencia `GAIA_SPECIFICATION.md` y sus compañeros, y se enlazan los RF/RNF. Los valores concretos (TTL, rate limits, retención, draw calls) están en sus documentos de origen.
4. **Alcance = 94 jornadas.** Cada jornada ≈ 6 h de foco. Las horas dentro de cada fase son **estimaciones de foco**, no tiempo de calendario.

### 1.2 Estructura de fases

El plan se organiza en **14 fases** (F0 a F13). No son semanas: son bloques de trabajo. Cada fase cierra con un hito verificable.

| Fase      | Entregable                                                                                                   | Jornadas |
| --------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| F0        | Fundación: repo, tooling, backend base, Redis, sesión, CORS, rate-limit, frontend scaffold, bundle benchmark | 10       |
| F1        | Globo 3D fotorrealista girando + cámara orbital (esfera, atmósfera, elevación, LOD, textura satelital)       | 10       |
| F2        | Módulo Incendios (NASA FIRMS) end-to-end: API, Redis, Worker 1, InstancedMesh, HUD FRP                       | 8        |
| F3        | Módulo Sismos (USGS) end-to-end: API, persistencia, Octree Worker 2, cilindros + ondas, HUD                  | 8        |
| F4        | Módulo Viento (Open-Meteo) end-to-end: API, persistencia, GPU Worker 3, partículas, HUD                      | 9        |
| F5        | Módulo Inundación (Nivel del Mar) end-to-end: shader de agua, slider +0/+10 m, elevación                     | 6        |
| F6        | Módulo Radiación (4 fuentes) end-to-end: normalización, persistencia, umbrales GLSL críticos                 | 7        |
| F7        | HUD Analítico (time-scrubber, toggles, telemetría) y pulido transversal de todos los HUDs                    | 6        |
| F8        | Resiliencia E2E (resguardo fallback Redis → API → local) y cómputo pesado en workers                         | 4        |
| F9        | Seguridad (hardening DDoS, CSP/nonce, XSS, auditorías)                                                       | 4        |
| F10       | Optimización 60 FPS, draw calls y memoria GPU (perfiles y presupuestos)                                      | 8        |
| F11       | Testing integral (Lighthouse, navegadores, cobertura) y CI/CD                                                | 6        |
| F12       | Despliegue en producción, monitoreo y operaciones                                                            | 5        |
| F13       | Pulido final, docs, licencia y demostración                                                                  | 3        |
| **Total** |                                                                                                              | **~94**  |

### 1.3 Convención de duración

1 jornada ≈ 6 h de **foco** (sin interrupciones). Cada micro-paso lleva su **Estimado** en horas (`~X h.`). Un grupo `Paso X.Y` agrupa micro-pasos que forman un entregable parcial; la suma de sus micro-pasos es su duración.

### 1.4 Cómo leer los pasos y micro-pasos

Cada fase se divide jerárquicamente así:

- **Paso X.Y** — unidad de trabajo con un entregable parcial (Backend, Persistencia, Worker, Renderizado, HUD).
- **Paso X.Y.Z** — **micro-paso**: acción concreta. Cada micro-paso tiene:
  - `- [ ]` la acción a ejecutar (marcar al terminar),
  - `**Criterio:**` la definición de "hecho" verificable,
  - `**Estimado:** ~X h.` horas de foco estimadas (1 jornada ≈ 6 h).
- Los grupos **Opcionales** están marcados `(Opcional)`: solo se hacen si el núcleo del roadmap va según lo previsto.

**Convención de commit por fase:** `feat/fase-X` (donde X es el número de fase). Cada micro-paso terminado se commitea bajo el grupo `feat` de su fase, manteniendo la historia legible.

## 2. FASE 0 — Fundación y Plataforma Compartida

> **Objetivo:** Todo lo que **todos** los módulos comparten: repo y tooling, backend base con contrato universal y Redis, infraestructura de base de datos y sesiones anonimizadas, scaffold frontend (store Valtio + cliente API + workers + bundle), y **seguridad esencial** (CORS, rate-limit global, headers, sesión cookie sin PII). Nada específico de un módulo se hace aquí: eso vive en su fase.

> **Duración:** 10 jornadas (~60 h). **Depende de:** nada (puede iniciarse ya). **RF:** —. **RNF:** RNF-01 (baseline), RNF-07 (base headers).

> **Ruta de ejecución:** 8 grupos · 66 micro-pasos.

### Pasos

**Paso 0.1 — Repo, tooling y CI básico**

**Paso 0.1.1 — Inicializar monorepo TS**

- [x] `npm create vite@latest frontend -- --template react-ts` para el frontend; `backend/` en Python (FastAPI, `pyproject.toml`/uv); `shared/` con tipos TS del contrato (generados desde el esquema OpenAPI).
- **Criterio:** se abre en `localhost:5173`; `npm run build` compila sin errores.
- **Estimado:** ~0.75 h.

**Paso 0.1.2 — Git + GitHub Actions vacío**

- [x] `git init`, `.gitignore` (node_modules, dist, .env, coverage), flujo Actions mínimo (CI sobre PR: `npm ci && npm run build` + vitest y `pytest` del backend).
- **Criterio:** push a GitHub dispara el flujo y pasa.
- **Estimado:** ~0.75 h.

**Paso 0.1.3 — Lint, format y pre-commit**

- [x] ESLint + Prettier + husky `pre-commit` (fmt + lint), scripts en workspace raíz.
- **Criterio:** `git commit` con mal formato se bloquea; `npm run lint` limpio.
- **Estimado:** ~0.25 h.

**Paso 0.1.4 — Carpeta compartida y contrato de errores**

- [x] En `shared/`: tipos + constantes de códigos de error (los 7 del catálogo de `GAIA_API_CONTRACT.md`) y utilidades de fecha.
- **Criterio:** los 7 códigos están tipados y exportados; test de roundtrip de utilidades.
- **Estimado:** ~1.25 h.

**Paso 0.2 — Backend base: contrato universal y Redis**

**Paso 0.2.1 — Servidor HTTP universal**

- [x] En `backend/`: servidor FastAPI (Python + Uvicorn) con `GET /api/health`, middleware global de errores que responde el contrato `{success, data, error}`.
- **Criterio:** `curl /api/health` → 200 `{success:true, data:{ok:true}, error:null}`; endpoints de módulos se registran en un router común.
- **Estimado:** ~1.25 h.

**Paso 0.2.2 — Cliente Redis de propósito general**

- [x] Cliente Redis async (`redis>=5`, `redis.asyncio`) reutilizable por los módulos (get/set/keys + TTL).
- **Criterio:** `PING` responde; TTL se respeta; timeout configurable.
- **Estimado:** ~1.25 h.

**Paso 0.2.3 — Rate-limit global (120 r/m y burst 240)**

- [x] Middleware de rate-limit global aplicado a **todos** los endpoints, implementado sobre Redis (**token bucket asíncrono** con `redis>=5` / `redis.asyncio`, middleware custom — ver [SECURITY §4.1](./GAIA_SECURITY.md)).
- **Criterio:** más de 120 peticiones/minuto → 429 con el código de error correspondiente; burst hasta 240 tolerado; test automatizado.
- **Estimado:** ~2 h.

**Paso 0.2.4 — Definir y exportar contrato de módulo**

- [x] Interfaz `DataModule` en `shared/`: `{endpoint, ttl, retention, worker, fetchRaw, normalize}` que cada módulo (F2-F6) implementa.
- **Criterio:** un módulo "prueba" mínimo cumple el contrato sin romper el servidor.
- **Estimado:** ~1.25 h.

**Paso 0.3 — Base de datos: esquema y sesiones**

**Paso 0.3.1 — Migraciones iniciales**

- [x] Configurar migraciones (Alembic + SQLAlchemy) con tablas base: `session`, `data_source`, `raw_payload`, `api_log`.
- **Criterio:** `migrate` crea el esquema en SQLite/Postgres; migraciones idempotentes.
- **Estimado:** ~1.25 h.

**Paso 0.3.2 — Sesión anonimizada (cookie sin PII)**

- [x] Cookie de sesión `gaia_session`: valor aleatorio sha256, `HttpOnly`, `SameSite=Lax`, Secure en prod, **sin PII**, TTL 30 días.
- **Criterio:** login de prueba crea sesión; el valor en BD es hash (no legible); test de atributos de la cookie.
- **Estimado:** ~2 h.

**Paso 0.3.3 — API log y retención base**

- [x] Registrar peticiones en `api_log` y configurar TTL/limpieza (retención 90 días) por `data_source`.
- **Criterio:** consulta SQL muestra logs con timestamps; el job de limpieza borra entradas viejas.
- **Estimado:** ~1.25 h.

**Paso 0.4 — Frontend scaffold: Valtio, API client y workers**

**Paso 0.4.1 — Store Valtio base**

- [x] Store global con `loading`/`error`/`lastUpdated` y acceso tipado desde componentes.
- **Criterio:** mutaciones desde 2 componentes comparten estado; acciones async actualizan flags.
- **Estimado:** ~1.25 h.

**Paso 0.4.2 — Cliente API tipado**

- [x] Wrapper `fetch` con timeout, reintentos y manejo de errores del contrato (`{success, data, error}`).
- **Criterio:** fallo de red → estado `error` tipado; reintento configurable; test unitario.
- **Estimado:** ~1.25 h.

**Paso 0.4.3 — Base de Web Worker**

- [x] Worker genérico con protocolo `postMessage` (in/out tipados) que sirva de plantilla a Workers 1-3.
- **Criterio:** mensaje de prueba ida/vuelta sin bloquear main thread.
- **Estimado:** ~0.75 h.

**Paso 0.4.4 — Bundle benchmark**

- [x] `build` con Vite; medir tamaño (gzip) del chunk principal.
- **Criterio:** se registra el baseline del bundle en el README de arquitectura (target ≤ 450 KB gzip).
- **Estimado:** ~0.75 h.

**Paso 0.4.5 — Seguridad esencial (CORS, headers, cookie en prod)**

- [x] CORS con orígenes permitidos, headers de seguridad (Helmet o manual: CSP base, HSTS, X-Content-Type-Options), cookie segura.
- **Criterio:** `curl -i` muestra los headers; origen no permitido recibe bloqueo CORS.
- **Estimado:** ~2 h.

**Paso 0.5 — Verificación E2E del grupo**

**Paso 0.5.1 — Smoke test de la plataforma**

- [x] Script/manual: subir backend + Redis + frontend y recorrer `/api/health`, rate-limit y una carga mínima del frontend. _*(validado: `backend/scripts/smoke.py`, stdlib, con `--api` y `--frontend`; 8 comprobaciones en verde contra backend + Redis + frontend reales.)*_
- **Criterio:** todo el flujo base responde; rate-limit se activa en prueba; logs sin errores.
- **Estimado:** ~1.25 h.

**Paso 0.5.2 — Actualizar docs y estado**

- [x] Actualizar el test de cobertura del ROADMAP (sección 16) y el estado en el README (versión). _*(validado: §16 con columna «Estado» y el estado real de F0; README con sección de estado.)*_
- **Criterio:** la Matriz de Trazabilidad refleja el estado real de F0; README refleja la fase actual.
- **Estimado:** ~0.75 h.

**Paso 0.5.3 — Commit del hito `feat/fase-0`**

- [x] Commit con mensaje estándar y tags de las RF/RNF implicadas. _*(validado: PR #1 `feat(fase-0): fundación de la plataforma (grupos 0.1 a 0.5) — RNF-01, RNF-07` mergeada en `main` con CI en verde.)*_
- **Criterio:** CI pasa; se puede revisar el diff de la fase como unidad.
- **Estimado:** ~0.75 h.

**Paso 0.6 — Testing base y QA de la plataforma**

**Paso 0.6.1 — Harness de test (pytest + TestClient)**

- [x] Configurar pytest y el `TestClient` de FastAPI para el HTTP universal. _*(validado: ya lo cubría el trabajo de 0.2.1/0.2.2 — `tool.pytest.ini_options` con `testpaths`/`pythonpath`/`asyncio_mode`, fixtures `client` y `fake_redis` en `conftest.py`, y `test_health.py` contra `GET /api/health`. Criterio verificado, sin cambios de código.)*_
- **Criterio:** un test de `GET /api/health` pasa; runner se integra a `pytest` y al CI.
- **Estimado:** ~1 h.

**Paso 0.6.2 — Tests de errores del contrato**

- [x] Test que valida las respuestas `{success, data, error}` con los 7 códigos del catálogo de la API. _*(validado: los 7 códigos de API_CONTRACT §6 verificados por HTTP; el catálogo está copiado a mano en el test para que un mapeo equivocado no se autovalide. Faltaban 502, 503 y 504. Reverificado al validar: los 7 aparecen en el test y 13 tests de contrato y job en verde. Mutación: mapear el 503 a `UPSTREAM_UNAVAILABLE` en `CODE_BY_STATUS` tumba 3 tests, incluido el que comprueba que la tabla no se desvía del catálogo.)*_
- **Criterio:** errores conocidos devuelven el código correcto.
- **Estimado:** ~1.25 h.

**Paso 0.6.3 — Mock de fuentes externas**

- [x] Abstracción para mockear las llamadas HTTP a fuentes (FIRMS, USGS, Open-Meteo, etc.) en los tests de backend (httpx2 MockTransport). _*(validado: `app/services/http_client.py` con el seam `build_client(transport=...)` y 4 tests con `MockTransport` que no tocan red. Comprobado que sin el seam la petición sí intenta abrir socket. Los fixtures con nombre de TESTING §5 —`mocked_upstream_429` y compañía— llegan con los módulos de F2.)*_
- **Criterio:** un módulo de prueba se testea sin red real.
- **Estimado:** ~1.25 h.

**Paso 0.6.4 — Gestor de fixtures**

- [x] Carpeta `backend/tests/fixtures` con muestras JSON/CSV por fuente (y `shared/test-fixtures` cuando el worker las necesite). _*(validado: `backend/tests/fixtures/fires_viirs_nrt_sample.csv` es la cabecera y la fila que documenta DATA_SOURCES, tal cual; la fixture `sample` de `conftest.py` devuelve el texto crudo y falla si el nombre no existe. La usan 2 tests, y mutar el FRP de la muestra tumba el de fetch. `shared/test-fixtures` espera a que el worker necesite muestras.)*_
- **Criterio:** fixtures versionados y usados por varios tests.
- **Estimado:** ~1 h.

**Paso 0.6.5 — Test de rate-limit global**

- [x] Test que supera 120 r/m y verifica 429 + burst hasta 240. _*(validado: el burst 240, la sostenida 120/min, el techo de capacidad, la exención de `/api/health` y el 429 antes que la sesión ya los cubrían los tests de 0.2.3; se añadió la dimensión real del bucket `{IP}:{endpoint}`, que sin ella un solo cliente podía dejar sin servicio a los demás sin que ningún test se enterara.)*_
- **Criterio:** el test documenta el comportamiento real del límite.
- **Estimado:** ~1.25 h.

**Paso 0.6.6 — Test de sesión anónima**

- [x] Test de cookie/token: atributos y ausencia de PII. _*(validado: los atributos de la cookie, el sha256 y el token opaco ya los cubrían los tests de 0.2.3; se añadió el conjunto exacto de campos del hash de sesión y que el user-agent se guarde solo como familia. Meter una IP o el UA crudo tumba el test y ninguno de los otros once.)*_
- **Criterio:** cookie con sha256, sin datos personales.
- **Estimado:** ~1 h.

**Paso 0.6.7 — Test de API log**

- [x] Test de escritura/consulta de `api_log` y retención. _*(validado: escritura, consulta SQL, purga e idempotencia ya los cubrían los tests de 0.3.3 contra PostgreSQL real —4 en verde ejecutados con el Python de Windows—; faltaban el comando que programa el cron de DEPLOYMENT §3.2 y el valor de retención, ambos ahora con test sin BD para que también corran en el CI. Reverificado al validar: los 4 tests de BD contra el PostgreSQL local y los 2 del job en verde. Mutación: bajar `RETENTION_DAYS` de 90 a 30 tumba el test de retención.)*_
- **Criterio:** logs correctos y limpieza programada.
- **Estimado:** ~1 h.

**Paso 0.6.8 — Test de helpers de Redis**

- [x] Test de get/set/TTL y de fallback local. _*(validado: roundtrip get/set añadido, y con Redis caído toda ruta /api/* daba 500 porque el rate-limit no capturaba el error; ahora degrada en fail-open con warning y el test ata las dos caras —se sirve y avisa—. La cadena completa Redis → API → local sigue siendo de 2.1.3 y F8.)*_
- **Criterio:** TTL respetado y fallback funciona.
- **Estimado:** ~1 h.

**Paso 0.6.9 — Smoke E2E (Playwright) base**

- [x] Primer flujo E2E: cargar app, health y un dato mock. _*(validado: `@playwright/test` + `playwright.config.ts` con los dos `webServer` (Vite y uvicorn real, sin Redis ni PostgreSQL) y un job E2E en el CI. Tres tests en verde —la app monta sin errores de consola, `/api/health` devuelve el sobre del contrato, y un dato mock enrutado por `page.route` deja el módulo en `live` pasando por el write path real (`runDataRequest` + `fetchAPI`, STATE §6.4) en el navegador—; mutar `"live"` por `"loading"` tumba solo el del dato mock. `tsc -b` cubre ya los tests E2E y vitest deja de recogerlos. Solo Chromium: el smoke de 4 navegadores con WebGL2 de TESTING §7.3 espera al globo de F1.)*_
- **Criterio:** el flujo E2E pasa en CI.
- **Estimado:** ~1.25 h.

**Paso 0.6.10 — Umbrales de cobertura iniciales**

- [x] Configurar cobertura base (backend ≥ 60 % en F0). _*(validado: `pytest-cov` en el grupo dev y `--cov=app` en los `addopts` de pytest, así que el CI lo hereda sin pedirlo a mano; `fail_under = 60` en `[tool.coverage.report]`. La suite está en 96.23 % (62 tests; los 8 de BD se saltan también en el CI) y el umbral está activo: a 99 % la suite falla. El ≥ 80 % de frontend de TESTING §1.3 sigue sin herramienta y sin `src/utils/`, que aún no existe.)*_
- **Criterio:** la suite reporta cobertura con umbral activo.
- **Estimado:** ~1 h.

**Paso 0.6.11 — CI: lint + test + build por PR**

- [x] Workflow completo en GitHub Actions (lint, test, build). _*(validado: pendiente de validación: el job de frontend corre `lint` → `build` → `perf:check` → `test` y el de backend `pytest` con el umbral de cobertura, todo en `pull_request` y en push a `main`. El paso grande era que `npm run lint` salía con 0 aunque hubiera avisos, así que no bloqueaba nada: ahora es `oxlint --deny-warnings`, verificado metiendo un `debugger` (exit 1) y sin él (exit 0). Sin linter de Python, que ningún doc pide y no se ha añadido.)*_
- **Criterio:** cada PR ejecuta los tres pasos y bloquea en rojo.
- **Estimado:** ~0.75 h.

**Paso 0.6.12 — Definición de Terminado (DoD)**

- [x] Checklist de DoD (barra `- [ ]` green + test + commit) documentado. _*(validado: pendiente de validación: `docs/GAIA_DOD.md` v1.0 con cabecera de versión y fecha, fila en el README y enlace desde `AGENTS.md`. El checklist ata los ocho puntos que se comprueban al cerrar un micro-paso (criterio verificado con evidencia, test que ata el comportamiento, mutación que lo tumba, suite en verde, commit con prefijo semántico, ROADMAP que refleja el estado real, valores de su doc de origen y deudas anotadas), incluye una tabla de las seis mutaciones ya usadas en la Fase 0 y las excepciones: docs, configuración pura y deuda pospuesta a propósito.)*_
- **Criterio:** el DoD es seguible por cualquier contribuidor.
- **Estimado:** ~0.25 h.

**Paso 0.7 — Benchmark y telemetría incipiente**

**Paso 0.7.1 — HUD de dev con FPS/draw calls**

- [x] Overlay de desarrollo: FPS, p95 y draw calls. _*(validado: `DevOverlay` mide FPS y p95 sobre una ventana de 120 frames con rAF y refresco cada 250 ms; la matemática pura vive en `utils/frameStats.ts` y las draw calls se leen de una fuente registrable por el render (`registerDrawCallsSource`), hoy `n/d` porque la escena base es 1.1.1 — no se inventa un número. Criterio verificado: el E2E ve el overlay con FPS > 0 real y la tecla `d` lo oculta; el build de producción no emite chunk del overlay, que es la forma fuerte de «ocultable en prod». Mutaciones: p95→p50 tumba el test de la cola del 5 %; quitar la puerta `import.meta.env.DEV` mete un chunk de 1.49 kB en producción. Verde: lint 0, `tsc -b` limpio, 45 unit, 4 E2E, backend 62/8 al 96.23 %.)*_
- **Criterio:** métricas en vivo y ocultable en prod.
- **Estimado:** ~1.25 h.

**Paso 0.7.2 — Timing de respuestas de API**

- [x] Log de duración por endpoint (nominal/p95) en dev. _*(validado: `app/services/timing.py` acumula por ruta `/api/*` una ventana de 100 muestras y escribe una línea INFO por petición con `avg` y `p95`; nominal = promedio (decidido por el usuario, la doc no lo fijaba). Reutiliza el `perf_counter` que `AccessLogMiddleware` ya calculaba, sin segundo timer, y solo con `DEBUG` (DEPLOYMENT §4.1), que ya existía. Dos topes deliberados: ventana de 100 muestras y 64 endpoints, porque las claves salen de la URL y un escáner de rutas inventadas crecería la memoria. Criterio verificado: con `DEBUG` la petición a `/api/_rl-probe` deja una línea `duración GET /api/_rl-probe avg=… p95=… n=1` en el log, y sin `DEBUG` ninguna. Mutaciones: p95→mediana tumba 2 tests; quitar la puerta `DEBUG` tumba 2. Verde: 73 passed / 8 skipped al 96.50 %.)*_
- **Criterio:** tiempos visibles en logs del backend.
- **Estimado:** ~1 h.

**Paso 0.7.3 — Baseline del bundle gzip**

- [x] Medir chunk principal gzip y guardar referencia. _*(validado: la herramienta ya existía (`npm run perf:check`, 0.4.4), así que el paso es medir y registrar, no escribir código. Baseline medido el 2026-09-27 sobre `f6c6abe` con Node v22.19.0: **JS inicial 66.8 KiB gzip** contra el objetivo ≤ 450 KB de `DEPLOYMENT` §5.1 (15 % usado) y chunk de arranque 66.8 KiB contra ≤ 180 KB (37 % usado); chunk de Three.js `n/d` hasta 1.1.1. Registrado en `docs/GAIA_PERFORMANCE.md` §4.1 con dos advertencias para quien compare después: hoy el build emite **un solo chunk** (aún no hay `manualChunks`, que prescriben DEPLOYMENT §5.1 y TESTING §3.4), así que el total será comparable pero los chunks sueltos no; y el footer de Vite (69.30 kB) y `perf:check` (66.8 KiB) miden el mismo chunk con distinto nivel de gzip, y gana el del script. Sin cambios de código.)*_
- **Criterio:** baseline registrado (target ≤ 450 KB).
- **Estimado:** ~0.75 h.

**Paso 0.7.4 — Medición del FCP base**

- [x] Lighthouse local con presupuesto FCP < 2 s. _*(validado: medido el 2026-09-28 con `npm run fcp` — **FCP 352 ms** de mediana (carreras 360/340/352) contra el presupuesto < 2 s de `TESTING` §3.1, con el 18 % del presupuesto usado. Herramienta **Playwright + `PerformanceObserver`**, no Lighthouse: desviación consciente, porque el perfil por defecto de Lighthouse es *Slow 4G* (150 ms RTT, 1.6 Mbps) y no el 4G que fija `TESTING` §3.3 (40 ms, 9 Mbps), así que su cifra no sería comparable con el resto de la documentación; Playwright ya venía como dependencia del E2E, sin añadir nada al toolchain. El throttling se emula por CDP `Network.emulateNetworkConditions` contra el build de producción servido por `vite preview`. Registrado en `docs/GAIA_PERFORMANCE.md` §4.2; Lighthouse entra donde el propio roadmap lo sitúa, en 11.2.1. Mutaciones: 9 Mbps con base 1024 en vez de 1000 tumba el test de conversión de caudal; devolver `0` en vez de `null` cuando no hay entrada de paint tumba el test de lectura — que es justo el fallo caro, porque `0 < 2000` y el presupuesto pasaría en verde sin haber pintado nada. Verde: lint 0 warnings, `tsc -b` limpio, 55 unit, 4 E2E, `perf:check` en presupuesto.)*_
- **Criterio:** se registra el FCP base del scaffold.
- **Estimado:** ~1 h.

**Paso 0.7.5 — Presupuesto de assets**

- [ ] Lista de límites para texturas/shaders por módulo. _(hueco de doc parcial: `docs/GAIA_PERFORMANCE.md` v1.0 ya tiene la §3 con la tabla por módulo, pero **ningún doc fija tamaños de textura ni de shader** — `TESTING` §3.4 solo dice «streaming por tiles» y `GLOBE_TEXTURES` cataloga APIs, no presupuestos — así que las casillas van `PENDIENTE` a propósito (decisión del usuario) en vez de rellenarse con números inventados. Cada fila se fija al abrir su módulo, F2–F6. El paso no se puede validar hasta que haya cifras.)_
- **Criterio:** presupuestos escritos en el doc de rendimiento.
- **Estimado:** ~0.75 h.

**Paso 0.7.6 — Análisis por chunk**

- [x] Reporte de tamaños por chunk (source maps, build analyze). _(validado: la herramienta era la parte que faltaba decidir, y sale del criterio. `rollup-plugin-visualizer`, porque el criterio es *identificar* módulos pesados a futuro y eso es un reporte; `size-limit` pone puertas por chunk y necesita cifras, que es justo lo que 0.7.5 tiene bloqueado. Vive en `frontend/vite.config.ts` —el fichero real, no el `vite.plugins.ts` que el árbol de `GAIA_PROJECT_STRUCTURE.md` §2 presuponía y que no existe— y detrás de `--mode analyze` (`npm run analyze`) en vez de una env var, porque en npm scripts una env var necesita `cross-env` para dar lo mismo en Windows que en Linux y `--mode` ya es de Vite. Sale un treemap de 175 KB en `dist/stats.html` con gzip y brotli, no raw: los presupuestos de §4 son de gzip, y comparar el número grande contra ellos daría falsos positivos. Un build normal no lo genera ni lo deja. Mutación: colgar el plugin siempre tumba el test que comprueba que el build normal no paga el reporte. No se mete en CI a propósito: el reporte es para mirar un momento concreto, no una puerta.)_
- **Criterio:** identificar módulos pesados a futuro.
- **Estimado:** ~0.75 h.

**Paso 0.7.7 — Perfilador dev overlay**

- [x] Overlay para perfilar frames (long tasks) en dev. _*(validado: el overlay de 0.7.1 suma dos detecciones, porque el criterio de "> 16 ms" y la API que el doc nombraba no pueden cumplirse a la vez. `lframe` cuenta los frames de la ventana que pasan de **18 ms** (el p95 de `TESTING` §3.2, no los 16.67 ms del frame budget: a 60 Hz todo frame dura eso y el contador marcaba 30 de 46 frames en una app sana), y `loaf` atribuye el bloqueo con `PerformanceObserver('long-animation-frame')`, que solo entrega frames de ≥ 50 ms. Sin atribución, el contador dice cuántos frames se pasaron de presupuesto pero no cuánto duró el culpable; con ella, ambos datos. Criterio verificado: el E2E bloquea el main thread 180 ms y ve subir `lframe` y `loaf` con la duración del bloqueo, dentro de rango (50–400 ms); donde la API no existe (Firefox, Safari) el overlay muestra `n/d` y no un 0. Desviación de herramienta registrada en `GAIA_PERFORMANCE.md` §5.1: se usa LoAF y no `longtask` porque en Chromium headless este último no emite entrada ni con un bloqueo de 1200 ms (`getEntriesByType('longtask')` = 0), medido, mientras LoAF reporta 182 ms por 180. Mutaciones: `>` por `>=` en el umbral tumba 1 test; `n/d` por `0` en la peor duración tumba 1; cambiar LoAF por `longtask` tumba el E2E. Verde: lint 0 warnings, `tsc -b` limpio, 59 unit, 5 E2E.)*_
- **Criterio:** se detectan tareas > 16 ms.
- **Estimado:** ~1 h.

**Paso 0.7.8 — Docs de presupuestos**

- [x] Sección de presupuestos en `GAIA_PERFORMANCE` (o SPEC). _*(validado: creado `docs/GAIA_PERFORMANCE.md` v1.0 con §2 presupuestos canónicos referenciados a su doc de origen (SPEC RNF-01/RNF-02/RNF-06, TESTING §3.2-§3.4, ROADMAP §17), §3 assets por módulo, §4 baselines, §5 herramientas reales y §6 trazabilidad; fila en el README. Consistente con §17: los valores se citan, no se repiten.)*_
- **Criterio:** documentado y consistente con §17 del ROADMAP.
- **Estimado:** ~0.75 h.

**Paso 0.7.9 — Reglas de orden de imports**

- [x] ESLint de import order y boundaries (`shared`). _(validado: el paso dice ESLint y el resultado es que hay dos linters, porque oxlint 1.85 no implementa `import/order` y —peor— ignora en silencio las reglas que no conoce: medido, `--deny import/order` y `--deny import/regla-inventada` dan el mismo 116 rules y 0 errores, así que poner esa regla en `.oxlintrc.json` habría parecido configurada sin cumplir nada. Reparto: oxlint sigue con react/typescript/oxc (`npm run lint`, intacto) y ESLint se queda solo con las dos reglas de este paso, en `eslint.config.mjs` de la raíz, que es lo único que alcanza a `frontend/` y `shared/` a la vez. Se usa `eslint-plugin-import-x` porque el `eslint-plugin-import` original no acepta ESLint 10 (9.39.5 ya está en `maintenance`); no se fuerza el árbol con `--legacy-peer-deps`. Orden: builtin → externo → padre → hermano, alfabético y con línea en blanco entre grupos, que es la convención que ya seguían la mayoría de los ficheros (`always` costaba 11 líneas en blanco, `never` 14). Boundary: `shared/` no puede importar de `frontend/` ni de `backend/` (es la base del grafo, cerrar un ciclo ahí no lo ven ni tsc ni Vite), y el `shared/` se consume siempre por su índice, nunca por un archivo suelto. Para lo segundo hizo falta `no-restricted-imports` de core y no `import-x/no-restricted-paths`: esta última resuelve la ruta antes de comparar y, sin `eslint-import-resolver-typescript`, no resuelve imports `.ts` (medido: 0 errores con un import directo a `store/state.types`). Verificado con cuatro sondas que luego se borran: import desordenado, import profundo a `shared/`, subpath `@gaia/shared/dates` y ciclo `shared/` → `frontend/`: las cuatro muerden. `npm run lint:imports` sale en 0 sobre el repo, y CI lo ejecuta. Verde: oxlint 0/0, build, 59 unit + 5 E2E, `perf:check` 66.8/450 KB, `shared` 12 test.)_
- **Criterio:** imports consistentes en todo el repo.
- **Estimado:** ~0.75 h.

**Paso 0.7.10 — Reporte de cobertura por fase**

- [x] Script que agrega cobertura por fase en CI. _(validado: «por fase» no lo define ningún doc, así que se decidió con el usuario: una fila por fase del ROADMAP, con el mapa fase→código explícito en `scripts/coverage.mjs` (el ROADMAP dice qué hace cada fase y `PROJECT_STRUCTURE` §2 cómo se llaman las carpetas, pero ningún doc los cruza) y las fases sin código saliendo con «sin código aún». Los nombres de carpeta son los del doc (`modules/seismic/`, `shaders/fire/`). Puerta solo donde el número es de un doc: `frontend/src/utils` y `frontend/src/store/actions.ts` al 80 % de `TESTING` §1, y `backend/app` al 60 % del `fail_under` de 0.6.10. El resto se publica sin bloquear, porque `radiation_normalizer.py` y `coordinates.ts` no existen y una puerta sobre código inexistente se salta siempre. Un archivo se atribuye a la fase de glob más largo: sin esa regla `backend/app/routers/fires.py` contaba en F0 y en F2 (medido: F0 daba 80 % en vez de 70 %). Tabla real de hoy: F0 96 %, con `utils` 100 %, `store/actions` 100 %, `services` 91 %, `workers` 100 % y `backend/app` 97 %. El frontend no tenía paquete de cobertura (`@vitest/coverage-v8` ahora sí) y el backend ya tenía `pytest-cov` con su `fail_under`; solo se le añadió `--cov-report=json` para que el agregador lo pueda leer. La tabla va al `GITHUB_STEP_SUMMARY` porque el log de un job desaparece al terminar. Dos bugs de formato, los dos silenciosos: el `json-summary` de vitest no tiene la envoltura `files` de istanbul y coverage.py da rutas relativas a `backend/`, así que la tabla salía entera en «sin código aún» con los reportes generados al lado; los dos tienen ahora un test con la forma real del reporte. Arreglo de paso: CI llamaba a `npm test` en la raíz y ese script no existía, o sea que el job frontend estaba roto; ahora corre los tests de los scripts de la raíz y los del frontend.)_
- **Criterio:** cada fase publica su cobertura.
- **Estimado:** ~1 h.

**Paso 0.7.11 — Nota de rendimiento en README**

- [x] Bloque de rendimiento (baselines) en el README raíz. _(validado: va entre «Stack» y «Fuentes de Datos», que es donde alguien que entra busca si la app rinde. El criterio pide que el README muestre baseline y target, así que las cifras están escritas, pero con dos columnas de fuente: `PERFORMANCE` §4.1/§4.2 para el baseline y el doc de origen de cada objetivo para el target. Es la excepción justificada a «no duplicar valores técnicos» de `AGENTS.md`: la regla evita que un número viva suelto y se desincronice, y por eso cada celda dice de dónde sale; sin las cifras el criterio no se cumple. Lo que no tiene baseline no recibe un número inventado: FPS, p95 y draw calls salen `n/d` con un puntero a `PERFORMANCE` §2 hasta que exista la escena (F1). Sin test, por `DOD` §5 (los pasos de docs se verifican con el diff y greps de coherencia), y el grep de coherencia lo cazó: la primera redacción citaba `≤ 450 KB` como `SPEC` RNF-01 y `SPEC` no lo dice en ningún sitio — lo fija `TESTING` §3.4, que es donde está ahora; el FCP sí está en los dos, `SPEC` RNF-06 lo escribe «2.0 segundos» y `TESTING` §3.1 «2.0 s». Sin inventar cifras nuevas: las cuatro medidas son las que ya existen en `PERFORMANCE` §4. Hallazgo que queda anotado y no arreglado aquí, por ser de otro paso: CI corre `perf:check` pero no `npm run fcp`, así que el presupuesto de FCP no está en puerta, solo el del bundle; por eso el README no dice que ambos estén en el CI.)_- **Criterio:** README muestra baseline y target.
- **Estimado:** ~0.25 h.

**Paso 0.7.12 — Grabación de baseline comparativa**

- [x] Guardar baseline en repo para comparativas futuras. _(validado: `GAIA_PERFORMANCE.md` §4 dejaba la ruta y el formato en `PENDIENTE` y delegaba en este paso, así que se preguntó: `docs/performance/baseline.json` en JSON, con comparador automático y con historial. JSON y no una tabla más en el doc porque tiene que poder leerlo un programa sin escribir un parser de markdown. El fichero va en `docs/` porque es dato, no herramienta: §4 ya decía que no es un script, así que no está en `scripts/`. Estructura: `metricas` es la última buena de cada métrica, contra eso se compara, y `historial` es un array con una entrada por sesión, con fecha, commit, Node y Vite, que es lo que hace falta para responder «ha ido mal» o «ya iba mal». Las claves llevan la unidad (`_kib`, `_ms`) para que el comparador no necesite una tabla de unidades. El comparador es `scripts/perf-baseline.mjs` (`npm run perf:baseline`), que reutiliza el `medir()` de `frontend/scripts/bundle-budget.mjs` en vez de medir otra vez, y corre en CI detrás de `perf:check`. Dos decisiones que ningún doc fijaba, las dos anotadas para que se puedan revertir: la tolerancia es del 1 % y no 0, porque el tamaño gzip se mueve con cualquier versión nueva de vite o esbuild sin que cambie el bundle, y con 0 el gate no distinguiría «ha entrado Three.js» de «ha subido vite»; y el FCP queda fuera del gate porque medirlo necesita navegador, build y `vite preview`, así que sale como `n/d (este script no lo mide)` y no como un 0 que parecería una mejora. Que el FCP no esté en puerta en CI sigue siendo la deuda que se anotó en 0.7.11, no se ha cerrado aquí. Dos cosas que salieron midiendo: el CSS de §4.1 estaba mal (1,47 KiB son 1472 bytes = 1,438 KiB, y con el doc así el gate daba un falso -4,8 % el primer día), corregido a 1,44 en §4.1 y en el README que lo duplicaba; y `medir()` solo miraba `.js`, así que el CSS que estaba en el baseline era una cifra que nadie podía comparar — ahora lo mide y tiene dos tests, uno que verifica que no se cuela en el JS inicial y otro que devuelve `null` en vez de 0 cuando no hay CSS, porque un 0 se compararía contra un 0 y no miraría nada. Mutaciones: bajar el baseline a 10 KiB tumba con rc=1 diciendo «+568,3 %», y un -0,8 % pasa con rc=0; el primer día salía un -4,8 % fantasma: no era una mejora, era el redondeo a 0,1 KiB del CSS. 7 tests nuevos en `tests/`, más 2 en el spec de `bundle-budget`.)_- **Criterio:** archivo de baseline versionado.
- **Estimado:** ~0.75 h.

**Paso 0.8 — Documentación y convenciones del repo**

**Paso 0.8.1 — README raíz (setup)**

- [x] README con pre-requisitos (Node para el frontend, Python/uv para el backend), `npm ci` + `uv sync`, variables y scripts. _(validado: sección «Puesta en marcha» entre Estado y Stack, con requisitos, el bloque de instalación, las variables y una tabla de los scripts. Los pasos se ejecutaron de verdad en vez de copiar el doc: `npm ci` en la raíz (369 paquetes), `uv sync` en `backend/`, `cp .env.example backend/.env`, `uv run alembic upgrade head` —este último sale con `ConnectionRefusedError` contra el 5432 si no está Postgres levantado, así que el README avisa de que la BD y el rol dedicados se crean antes, en `DEPLOYMENT` §3.2 paso 2— y `uv run uvicorn` respondiendo con el contrato universal (`{"success": true, ..., "redis": "disconnected"}`, fail-open de 0.6.8). Las versiones de la tabla de requisitos salen de `DEPLOYMENT` §3.1 y se citan ahí en vez de repetirse: el mismo patrón que el bloque de Rendimiento de 0.7.11. Tres correcciones que salieron al comprobar los comandos en vez de leerlos. `DEPLOYMENT` §3.2 dice `cd frontend && npm install`, y el repo es un workspace de npm (root + `frontend` + `shared`), así que el README pone `npm ci` en la raíz, que es lo que hace el CI. Y el CI llamaba a `npm run perf:check` en la raíz, donde ese script no existía: mismo fallo que el `npm test` de 0.7.10, y desde 0.7.3; se arregla proxeyéndolo en la raíz como ya hacen `dev`, `build` y `lint`, no tocando el CI. Con eso los siete comandos que pide el CI existen en la raíz y se comprobó uno a uno. El `curl` al dev server devuelve código 0 desde WSL y no por el README: Vite 8 escucha solo en `[::1]` y hace falta `--host 127.0.0.1`, que es lo mismo que ya documenta `playwright.fcp.config.ts`; el dev server arranca (`ready in 3423 ms`) y quien lo prueba de verdad es el E2E, que lo levanta con el host correcto. Sin test, por `DOD` §5; la evidencia es que la secuencia del README se ha ejecutado. Nota: `VITE_GAIA_API_BASE_URL` y `VITE_GAIA_PUBLIC_URL` están en `DEPLOYMENT` §4.3 pero ningún código las lee todavía —el cliente de API no consulta `import.meta.env`—, así que el README las lista como lo que son, variables documentadas, sin afirmar que la app dependa de ellas; conectarlas es trabajo de F0.4. Verde: 15 unit de raíz + 63 de frontend, 5 E2E, 73 backend, oxlint 0/0, `lint:imports` rc=0, build 669 ms, `perf:check` y `perf:baseline` OK.)_- **Criterio:** se puede subir GAIA siguiendo el README.
- **Estimado:** ~1 h.

**Paso 0.8.2 — Documento de arquitectura inicial**

- [x] Esquema de módulos (backend/worker/GPU/HUD) y flujo de datos. _(validado: `docs/GAIA_ARCHITECTURE.md` v1.0)_
- **Criterio:** el doc describe la arquitectura de F0-F1.
- **Estimado:** ~1.25 h.

**Paso 0.8.3 — Guía de contribución**

- [x] CONTRIBUTING con setup, tests y pre-commit. _(validado: `docs/GAIA_CONTRIBUTING.md` v1.0)_
- **Criterio:** un nuevo dev sigue la guía sin dudas.
- **Estimado:** ~0.75 h.

**Paso 0.8.4 — Templates de issue/PR**

- [x] Plantillas con checklist (RFC3339, RF/RNF, tests). _(validado: dos issue forms y una plantilla de PR en `.github/`)_
- **Criterio:** issues/PRs con estructura consistente.
- **Estimado:** ~0.75 h.

**Paso 0.8.5 — CHANGELOG y versionado**

- [x] CHANGELOG semántico y etiquetado de releases. _(validado: `docs/GAIA_CHANGELOG.md` v1.0, con `Unreleased` para F0 y el `v0.1.0` al cerrar la fase)_
- **Criterio:** cada fase añade su entrada.
- **Estimado:** ~0.75 h.

**Paso 0.8.6 — ADR de stack**

- [x] ADR-001 con la decisión de stack (Vite/three/Valtio/redis/postgres). _*(validado: `docs/adr/ADR-001-stack.md`, con la decisión por capa citada contra el doc que la justifica —`TECH_STACK` §2 y `DEPLOYMENT` §4— para no duplicar nada. Registra cuatro alternativas descartadas que ya estaban documentadas (Webpack, Jotai/Zustand, `aioredis`, `slowapi`) y, en §3.2, dice sin adornos las dos que **no** tienen comparación escrita: por qué Python y no Node en el backend, y por qué PostgreSQL+TimescaleDB y no otro almacén. Ese hueco estaba y se ha hecho visible en vez de rellenarse con una razón inventada. §4 anota el coste real de la decisión, incluido que el objetivo de frame de RNF-01 no se puede gatear en CI sin GPU. Referenciable: fila propia en el README y enlaces cruzados desde `TECH_STACK` (1.3 → 1.4) y `ARCHITECTURE` (1.0 → 1.1); los 4 enlaces del ADR resuelven. **Ubicación y formato los decidió el usuario**: ningún doc fijaba dónde viven los ADR, y se eligió un directorio propio para que la serie escale a ADR-002 sin mezclarse con los docs por tema.)*_
- **Estimado:** ~0.75 h.

**Paso 0.8.7 — Configuración de editor**

- [x] VS Code settings (format on save), editorconfig. _*(validado: `.editorconfig` fija 2 espacios / LF / 80 columnas como los defaults de Prettier, con `[*.py]` a 4 porque Prettier no tiene parser de Python; `.vscode/settings.json` formatea al guardar y `extensions.json` recomienda la extensión de Prettier. Con `formatOnSave` activo, los 3 ficheros que ya incumplían se normalizan: `App.css`, `index.css` y `shared/tsconfig.json`)*_
- **Criterio:** formato uniforme entre devs.
- **Estimado:** ~0.25 h.

**Paso 0.8.8 — Convención de commits documentada**

- [ ] Documentar `feat/fase-X` y `fix(fase): ...`.
- **Criterio:** la convención se aplica desde F1 en adelante.
- **Estimado:** ~0.75 h.

**Paso 0.8.9 — `.env.example`**

- [ ] Variables de entorno documentadas sin secretos.
- **Criterio:** `.env.example` completo y sin valores reales.
- **Estimado:** ~0.25 h.

**Paso 0.8.10 — Naming de branches**

- [ ] Convención `fase-X/feature-...` documentada.
- **Criterio:** nombres coherentes en el repo.
- **Estimado:** ~0.25 h.

**Paso 0.8.11 — Mapa de fases en README**

- [ ] Tabla resumen de las 14 fases con enlaces al ROADMAP.
- **Criterio:** README refleja el roadmap y su estado.
- **Estimado:** ~0.75 h.

**Paso 0.8.12 — Metadata del documento**

- [ ] Versión/estado/fecha actualizados en GAIA_ROADMAP.
- **Criterio:** metadata al día tras cada fase.
- **Estimado:** ~0.25 h.

**Paso 0.8.13 — Consistencia con docs compañeros**

- [ ] Revisar que SPEC/SECURITY/STATE coinciden con lo construido.
- **Criterio:** sin desviaciones entre docs.
- **Estimado:** ~1 h.

**Paso 0.8.14 — Enlaces cruzados**

- [ ] Revisar todos los `./GAIA_*.md` referenciados existen.
- **Criterio:** sin enlaces rotos en los docs.
- **Estimado:** ~0.75 h.

**Paso 0.8.15 — Actualizar Matriz de Trazabilidad**

- [ ] Marcar F0 cubierta en la sección 16 del ROADMAP.
- **Criterio:** la matriz refleja el estado real.
- **Estimado:** ~0.75 h.

**Paso 0.6.13 — Test de migraciones idempotentes**

- [x] Test que ejecuta migraciones dos veces. _*(validado: el test ya existía pero comprobaba menos de lo que dice el criterio: solo que las tablas base existieran tras dos `upgrade head`, así que una migración que añadiera una columna o cambiara un tipo habría pasado. Ahora compara el esquema entero —tabla → {columna: tipo}— con el inspector de SQLAlchemy, que además es portable. El otro problema era que la capa de BD no se ejecutaba nunca en CI: sin PostgreSQL los tests hacen `pytest.skip` y el job de backend salía verde sin verificar el esquema, la sesión ni el api_log. `GAIA_DATABASE` §6.1 dice que CI ejecuta las migraciones «contra una DB limpia en los tests de integración», así que el job de backend ahora levanta un servicio `postgres:18` con `pg_isready` como healthcheck; usuario, contraseña y base coinciden con el default de `app/config.py`, de modo que no hace falta pasar `DATABASE_URL`. Verificado contra el PostgreSQL 18 del equipo: 8 de 8 tests de BD en verde (2 de migraciones, 4 de api_log, 2 de session). Mutación hecha a propósito para que la segunda ejecución quitara una columna: el test falla con el diff de `session_events`, justo lo que la aserción anterior no veía. Suite completa desde WSL: 73 pasados, 8 omitidos, 96,50 % de cobertura. El servicio se pusheó con este mismo commit, de modo que su primer run real en Actions es posterior a esta validación.)*_
- **Estimado:** ~0.75 h.

**Paso 0.6.14 — Test de CORS y headers**

- [x] Test de orígenes permitidos y headers de seguridad base. _*(validado: el paso ya estaba cubierto y era una casilla sin marcar, no trabajo perdido. `backend/tests/test_security_headers.py` (10 tests) nació en 0.4.5 y cubre los dos lados del criterio: headers presentes —las 5 fijas de `GAIA_SECURITY` §6.2 más la CSP canónica con nonce distinto en cada respuesta— y origen no permitido bloqueado —sin `access-control-allow-origin` y preflight 400—, con los casos permitidos como contraprueba. Se comprobó que el test sirve: con `allow_origins=["*"]` en `main.py` fallan los 2 tests del origen no permitido, y restaurado el allowlist vuelven a pasar los 10. No hizo falta tocar código: el criterio se cumplía.*_
- **Estimado:** ~0.75 h.

**Paso 0.7.13 — Medición de p95 de frame en dev**

- [ ] Overlay de p95 de frame por capa en dev.
- **Criterio:** se observa p95 en vivo para las 5 capas.
- **Estimado:** ~0.75 h.

**Paso 0.7.14 — Comparativa baseline vs fase**

- [x] Script que compara el baseline guardado con la métrica actual. _*(validado: `scripts/perf-baseline.mjs` compara la medición de hoy contra `docs/performance/baseline.json` y el job frontend de CI lo ejecuta. Verificado: con el baseline real sale exit 0; bajando a la fuerza `bundle_js_inicial_kib` a 10 KiB sale exit 1 con «+568,3 %», o sea que el gate bloquea de verdad y no solo informa. La tolerancia es del 1 % a propósito, para distinguir «ha entrado Three.js» de «ha subido esbuild».)*_
- **Estimado:** ~0.75 h.

**Paso 0.7.15 — Script de medición automática**

- [x] Script headless para medir FPS/bundle en CI. _*(validado: el bundle ya lo medía `perf:check`; faltaba el frame, y ahora hay `frontend/tests/fps/fps.spec.ts` con su config propia, el script `npm run fps` y un paso en el job frontend de CI. La estadística no se reimplementa: importa `computeStats` de `src/utils/frameStats.ts`, el mismo que alimenta el `DevOverlay`, para que el número de CI y el que se ve en pantalla no puedan separarse por una diferencia de aritmética. Medido sobre el build de producción: 59,5 / 59,5 / 60,0 FPS con p95 de 16,7-16,8 ms, 120 frames por carrera en tres carreras. **No se gatea contra los 60 FPS ni el p95 ≤ 18 ms de `TESTING` §3.2**: Chromium headless no tiene GPU, así que esa puerta se pasaría siempre y daría una confianza falsa; lo único que se exige es que la medición exista, porque un 0 o un `n/d` es un fallo silencioso, no un resultado. Mutación: pedir 0 frames al muestreador y el test falla con «la carrera 1 no recogió ningún frame». `tests/fps/**` queda excluido de vitest como `tests/fcp/**`, y `npm test` sigue en 63 y `npm run lint` en 0 avisos.)*_
- **Estimado:** ~0.75 h.

**Paso 0.7.16 — Ajuste del presupuesto de FCP**

- [x] Confirmar presupuesto FCP < 2 s con el scaffold. _*(validado: el presupuesto vive en `frontend/scripts/fcp.mjs` (`FCP_MAX_MS = 2000`) y el test de Playwright lo verifica sobre el build de producción con red 4G. Medido hoy: FCP mediana 304 ms (carreras 332, 304 y 300), un 15 % del presupuesto. El baseline aún guarda los 352 ms de la medición anterior; el comparador no gatea FCP, así que se actualiza cuando se cierre la fase.)*_
- **Estimado:** ~0.75 h.

**Paso 0.7.17 — Validación del overlay de dev**

- [x] Verificar que el overlay no se muestra en prod. _*(validado: comprobado sobre el artefacto, no sobre el código: tras `npm run build`, ningún chunk de `dist/assets/` contiene el texto del overlay ni una referencia a `DevOverlay`, porque `App.tsx` lo importa dinámicamente tras `import.meta.env.DEV` y Vite elimina la rama del grafo. En dev sigue montado, con sus métricas.)*_
- **Estimado:** ~0.75 h.

**Paso 0.7.18 — Snapshot del baseline**

- [x] Guardar snapshot del baseline en el repo. _*(validado: `docs/performance/baseline.json` está versionado (commit 4abe070) y es JSON legible con `schema`, `metricas` y `historial` con el origen de cada cifra. Lo lee el comparador de 0.7.14. Un dato sin medir va solo en `historial`, no en `metricas`, para no gatear una cifra que nunca se midió.)*_
- **Estimado:** ~0.75 h.

## 3. FASE 1 — Motor 3D y Globo Terráqueo

> **Objetivo:** Ver el globo fotorrealista girando: esfera, atmósfera día/noche, elevación, textura satelital por LOD y cámara orbital. Es la plataforma única sobre la que se montan todos los módulos (Fases 2–6).

> **Duración:** 10 jornadas (~60 h). **Depende de:** Fase 0 (puede iniciarse en paralelo con el tramo final). **RF:** RF-01, RF-02. **RNF:** RNF-01, RNF-06, RNF-07.

> **Ruta de ejecución:** 9 grupos · 32 micro-pasos.

### Pasos

**Paso 1.1 — Motor de renderizado: escena y cámara**

**Paso 1.1.1 — Escena three.js base**

- [ ] Escena, cámara y los tres-core básicos (luz ambiental, control de render loop).
- **Criterio:** escena con color de fondo y un cubo de referencia renderiza; se mantiene 60 FPS vacío.
- **Estimado:** ~2.25 h.

**Paso 1.1.2 — Cámara orbital**

- [ ] `OrbitControls` con límites (pendiente y zoom con mínimo/distancia), manejo de resize.
- **Criterio:** se puede orbitar, hacer zoom dentado límites y resize correcto; sin "volteretas" en polos.
- **Estimado:** ~2.25 h.

**Paso 1.2 — Esfera y atmósfera**

**Paso 1.2.1 — Esfera base con textura de color**

- [ ] Geoide (`SphereGeometry` con radio 1) + material con textura base (env or static color).
- **Criterio:** esfera renderiza con detalles; normales correctas (sin bandas visible).
- **Estimado:** ~2.25 h.

**Paso 1.2.2 — Atmósfera día/noche (ShaderMaterial)**

- [ ] Shader de atmósfera: día/noche (terminator) y glown frontal.
- **Criterio:** el lado noche se ve oscuro con brillo de borde; parámetros ajustables.
- **Estimado:** ~3.25 h.

**Paso 1.3 — Elevación y topografía**

**Paso 1.3.1 — Datos de elevación por LOD**

- [ ] Cargar elevación (DEM) según nivel de detalle; multa de malla con desplazamiento por altitud.
- **Criterio:** al acercar, el relieve se ve (montañas visibles); sin caídas bruscas en LOD.
- **Estimado:** ~4.25 h.

**Paso 1.3.2 — Normalización de escala**

- [ ] Escalar altitudes de forma que el globo no se vea "peludo" (rango controlado).
- **Criterio:** relieve suave, picos visibles y océanos planos; parámetros en constantes.
- **Estimado:** ~1.75 h.

**Paso 1.4 — Textura satelital y LOD**

**Paso 1.4.1 — Carga de texturas satelitales por LOD**

- [ ] Texturas de tiles de 2-3 niveles (baja resolución global → detalle regional) según distancia.
- **Criterio:** cambiar distancia cambia tile; sin saltos de textura evidentes.
- **Estimado:** ~3.25 h.

**Paso 1.4.2 — UVs y empaquetado**

- [ ] Ajustar UVs de los tiles para que no haya costuras ni solapamientos.
- **Criterio:** revisión visual en polos y ecuador sin artefactos de empalme.
- **Estimado:** ~2.25 h.

**Paso 1.5 — Cámara e interacción**

**Paso 1.5.1 — Doble clic para zoom a coordenada**

- [ ] Raycast de doble clic → mueve la cámara a la lat/lon con animación suave.
- **Criterio:** doble clic en una zona la acerca centrándola; sin "salto" brusco.
- **Estimado:** ~2.25 h.

**Paso 1.5.2 — Zoom limitado a nivel ciudad**

- [ ] Limitar zoom máximo (distancia mínima) para no perder contexto.
- **Criterio:** no se puede traspasar el límite; feedback visual suave.
- **Estimado:** ~1 h.

**Paso 1.6 — Verificación E2E del globo**

**Paso 1.6.1 — Prueba de globo con datos estáticos**

- [ ] Cargar un dataset estático pequeño (mock 100 puntos) sobre el globo y revisar orientación/proyección.
- **Criterio:** los puntos aparecen en lat/lon correctas con el globo; no hay desalineaciones.
- **Estimado:** ~2.25 h.

**Paso 1.6.2 — Auditoría de rendimiento base**

- [ ] Perfil con DevTools: FPS y memoria en time-lapse de 30 s.
- **Criterio:** ≥ 50 FPS medio con el globo solo; sin subidas de memoria sostenidas.
- **Estimado:** ~2.25 h.

**Paso 1.6.3 — Commit del hito `feat/fase-1`**

- [ ] Commit con RF/RNF implicadas (RF-01, RF-02, RNF-06, RNF-07).
- **Criterio:** CI pasa; el globo se puede mostrar como demo.
- **Estimado:** ~1 h.

**Paso 1.7 (Opcional) — Batimetría GEBCO**

**Paso 1.7.1 — Capa de profundidades oceánicas**

- [ ] Incorporar raster de batimetría como overlay del océano.
- **Criterio:** el océano muestra gradientes de profundidad; desactivable.
- **Estimado:** ~2.25 h.

**Paso 1.7.2 — Integración con elevación en shader**

- [ ] Combinar batimetría con el shader de elevación (profundidad negativa).
- **Criterio:** el globo muestra relieve terrestre y oceánico coherente.
- **Estimado:** ~2.25 h.

**Paso 1.8 (Opcional) — Constelaciones y límites**

**Paso 1.8.1 — Estrellas de fondo esféricas**

- [ ] Fondo de estrellas (points) estático.
- **Criterio:** las estrellas acompañan la rotación del escape vista exterior.
- **Estimado:** ~1 h.

**Paso 1.8.2 — Límites de países (geoJSON)**

- [ ] Overlay de bordes con LOD (solo visibles a ciertos niveles).
- **Criterio:** los bordes aparecen/desaparecen según zoom sin parpadeo.
- **Estimado:** ~2.25 h.

**Paso 1.9 — QA visual y robustez del globo**

**Paso 1.9.1 — Test de proyección lat/lon → xyz**

- [ ] Test unitario de la conversión lat/lon a coordenadas de la esfera.
- **Criterio:** puntos de control (ecuador, polos, meridianos) correctos.
- **Estimado:** ~1.75 h.

**Paso 1.9.2 — Test de límites de cámara**

- [ ] Test de límites de pendiente/zoom del OrbitControls.
- **Criterio:** la cámara respeta los límites al forzar input.
- **Estimado:** ~1 h.

**Paso 1.9.3 — Transición de atmósfera al día**

- [ ] Suavizado del terminador al pasar de lado noche a día.
- **Criterio:** sin cambio brusco de iluminación.
- **Estimado:** ~1.75 h.

**Paso 1.9.4 — Terminador correcto (equinoccio)**

- [ ] Verificar visualmente el terminador en condiciones controladas.
- **Criterio:** el arco día/noche coincide con la referencia.
- **Estimado:** ~1 h.

**Paso 1.9.5 — Pausa al perder foco**

- [ ] Pausar render al perder visibilidad de pestaña.
- **Criterio:** el render se reanuda sin desincronización.
- **Estimado:** ~1 h.

**Paso 1.9.6 — DPR dinámico**

- [ ] Limitar `devicePixelRatio` (máx. 2) y actualización al cambiar.
- **Criterio:** re-render sin pérdida de nitidez ni sobrecarga.
- **Estimado:** ~1.75 h.

**Paso 1.9.7 — Reducción de muestreo en idle**

- [ ] Bajar la frecuencia de render cuando no hay input.
- **Criterio:** ahorro de CPU en reposo sin flicker.
- **Estimado:** ~1.75 h.

**Paso 1.9.8 — Manejo de WebGL context loss**

- [ ] Listener de `webglcontextlost` con restauración.
- **Criterio:** la app se recupera sin recargar.
- **Estimado:** ~2.25 h.

**Paso 1.9.9 — Prueba WebGL1/2 y móvil**

- [ ] Matriz de compatibilidad (WebGL1 con fallback, móvil básico).
- **Criterio:** el globo funciona en los contextos objetivo.
- **Estimado:** ~2.25 h.

**Paso 1.9.10 — Fallback de texturas**

- [ ] Manejo de error de carga de textura → placeholder.
- **Criterio:** textura rota no rompe el globo.
- **Estimado:** ~1 h.

**Paso 1.9.11 — Test del orden del LOD**

- [ ] Verificar que los tiles se ordenan/cargan por prioridad.
- **Criterio:** cerca se carga el tile de mayor detalle primero.
- **Estimado:** ~1.75 h.

**Paso 1.9.12 — Benchmark de carga de texturas**

- [ ] Medir tiempos de carga por nivel de LOD.
- **Criterio:** se documenta el costo por nivel.
- **Estimado:** ~1.75 h.

**Paso 1.9.13 — Limpieza de texturas viejas**

- [ ] Evictar texturas de LOD fuera de alcance (dispose).
- **Criterio:** memoria de GPU estable al cambiar de nivel.
- **Estimado:** ~1 h.

**Paso 1.9.14 — Test de fuga en 10 min**

- [ ] Time-lapse de 10 min midiendo memoria.
- **Criterio:** sin crecimiento lineal de memoria.
- **Estimado:** ~1.75 h.

**Paso 1.9.15 — Actualizar docs de rendimiento del globo**

- [ ] Registrar límites del globo en el doc de rendimiento.
- **Criterio:** doc coherente con los benchmarks.
- **Estimado:** ~1 h.

## 4. FASE 2 — Módulo Incendios (NASA FIRMS) — Corte Vertical Completo

> **Objetivo:** Primera capa **de extremo a extremo**: endpoint `/api/fires` con caché/fallback, persistencia `fire_hotspot`, Worker 1, `InstancedMesh` coloreado por FRP y HUD mínimo. Es el patrón que repiten las Fases 3–6.

> **Duración:** 8 jornadas (~48 h). **Depende de:** Fases 0 y 1. **RF:** RF-03, RF-04. **RNF:** RNF-02, RNF-03, RNF-05 (fallback).

> **Ruta de ejecución:** 8 grupos · 30 micro-pasos.

### Pasos

**Paso 2.1 — Backend: endpoint `/api/fires`**

**Paso 2.1.1 — Parser de NASA FIRMS y endpoint**

- [ ] Fetch de FIRMS (CSV/GeoJSON), parseo a formato normalizado del contrato.
- **Criterio:** `/api/fires` responde datos paginados con el contrato `{success, data, error}` en errores; test con fixture.
- **Estimado:** ~2 h.

**Paso 2.1.2 — Filtros por horas y coordenadas**

- [ ] Parámetros `hours` (24/48), bbox y límite de resultados.
- **Criterio:** los filtros son validados; respuestas correctas validadas por test.
- **Estimado:** ~1.5 h.

**Paso 2.1.3 — TTL y caché con Redis**

- [ ] Cachear respuestas en Redis con TTL 300 s (y fallback a datos locales si no hay red).
- **Criterio:** 2.ª petición sirve desde caché sin tocar la API (log lo confirma).
- **Estimado:** ~2 h.

**Paso 2.2 — Persistencia: tabla `fire_hotspot`**

**Paso 2.2.1 — Migración y UPSERT**

- [ ] Tabla `fire_hotspot` (id, frp, rad, geom, captured_at) con UPSERT por id_absoluto.
- **Criterio:** ingestión doble no duplica registros; índices creados.
- **Estimado:** ~2 h.

**Paso 2.2.2 — Retención 90 días**

- [ ] Job de limpieza que borra hotspots más viejos que 90 días.
- **Criterio:** registros viejos desaparecen; job idempotente y en log.
- **Estimado:** ~1 h.

**Paso 2.3 — Worker 1: procesamiento de incendios**

**Paso 2.3.1 — Worker de normalización**

- [ ] Worker 1 que convierte datos crudos → hotspots normalizados (y persiste).
- **Criterio:** el worker procesa un fixture completo sin bloquear main thread.
- **Estimado:** ~2 h.

**Paso 2.3.2 — Ruta de fallback (RAM si Redis cae)**

- [ ] Si Redis no está: usar caché en memoria (módulo) y loggearlo.
- **Criterio:** simulando caída de Redis, `/api/fires` responde desde RAM.
- **Estimado:** ~2 h.

**Paso 2.4 — Renderizado 3D de incendios**

**Paso 2.4.1 — InstancedMesh coloreado por FRP**

- [ ] `InstancedMesh` de puntos (máx. 20k instancias) con color según FRP y opacidad.
- **Criterio:** 5k puntos se renderizan sin baja de fps; color correlacionado con FRP.
- **Estimado:** ~3 h.

**Paso 2.4.2 — Tamaño/intensidad variable**

- [ ] Escalar tamaño y opacidad según intensidad para visualización.
- **Criterio:** puntos intensos más grandes y brillantes; legible sobre el globo.
- **Estimado:** ~1.5 h.

**Paso 2.4.3 — Bisútil (agregación) para >20k**

- [ ] Agregación por grilla al superar umbral para respetar presupuesto de instancias.
- **Criterio:** con dataset denso no se supera el límite; perfiles estables.
- **Estimado:** ~2 h.

**Paso 2.5 — HUD mínimo de incendios**

**Paso 2.5.1 — Contador y último update**

- [ ] Panel mínimo con conteo activo, timestamp del último poll y estado de conexión.
- **Criterio:** el panel refleja el estado real del store.
- **Estimado:** ~1 h.

**Paso 2.5.2 — Leyenda de color (FRP)**

- [ ] Leyenda de gradiente FRP (bajo → crítico).
- **Criterio:** la leyenda renderiza con los colores reales del render.
- **Estimado:** ~0.5 h.

**Paso 2.6 — Verificación E2E del módulo**

**Paso 2.6.1 — Recorrido completo con datos reales**

- [ ] Encender backend + worker + frontend, ver incendios reales (FIRMS) en el globo.
- **Criterio:** flujo completo operativo; datos reales se ven y el HUD cuadra.
- **Estimado:** ~3 h.

**Paso 2.6.2 — Test de fallback y caché**

- [ ] Prueba de caché (2.º request sin API) y fallback (Redis apagado).
- **Criterio:** ambos escenarios pasan el test de comportamiento.
- **Estimado:** ~2 h.

**Paso 2.6.3 — Commit del hito `feat/fase-2`**

- [ ] Commit con RF/RNF implicadas (RF-03, RF-04, RNF-02, RNF-03, RNF-05).
- **Criterio:** CI pasa; la fase se puede demostrar como módulo completo.
- **Estimado:** ~1 h.

**Paso 2.7 (Opcional) — VMAP0 de Perú y Chile**

**Paso 2.7.1 — Cargar VMAP0 de regiones**

- [ ] Descargar/mapear VMAP0 Perú y Chile.
- **Criterio:** los datos cargados corresponden a las coordenadas esperadas.
- **Estimado:** ~2 h.

**Paso 2.7.2 — Visualización de orografía**

- [ ] Render de la orografía de las regiones sobre el globo.
- **Criterio:** la región se ve con relieve sobre el globo.
- **Estimado:** ~1.5 h.

**Paso 2.8 — Integración y tests del módulo de incendios**

**Paso 2.8.1 — Contract test de `/api/fires`**

- [ ] Test que verifica el contrato de respuesta del módulo.
- **Criterio:** el endpoint cumple el contrato `DataModule`.
- **Estimado:** ~1.5 h.

**Paso 2.8.2 — Test de UPSERT del repositorio**

- [ ] Test de inserción duplicada sin duplicar registros.
- **Criterio:** upsert idempotente.
- **Estimado:** ~1.5 h.

**Paso 2.8.3 — Test de retención 90 días**

- [ ] Test del job de limpieza con datos antiguos.
- **Criterio:** registros viejos eliminados correctamente.
- **Estimado:** ~1 h.

**Paso 2.8.4 — Mock de NASA FIRMS**

- [ ] Fixture + mock de la API de FIRMS.
- **Criterio:** tests del módulo sin red real.
- **Estimado:** ~1.5 h.

**Paso 2.8.5 — Test de caché (2.ª petición)**

- [ ] Test que confirma respuesta desde Redis tras la primera vez.
- **Criterio:** sin llamada externa en la 2.ª petición.
- **Estimado:** ~1.5 h.

**Paso 2.8.6 — Test de fallback RAM**

- [ ] Test con Redis apagado → respuesta desde memoria módulo.
- **Criterio:** el módulo responde en modo resguardo.
- **Estimado:** ~1.5 h.

**Paso 2.8.7 — Perfil de instancias (5k)**

- [ ] Benchmark de renderizado con 5k hotspots.
- **Criterio:** 60 FPS estables con 5k instancias.
- **Estimado:** ~1.5 h.

**Paso 2.8.8 — Cobertura del worker 1**

- [ ] Alcanzar cobertura ≥ 70 % del worker de normalización.
- **Criterio:** umbral verificado por el runner.
- **Estimado:** ~1.5 h.

**Paso 2.8.9 — Logs del módulo**

- [ ] Instrumentar logs (ingestión, caché, fallback) del módulo.
- **Criterio:** logs estructurados y sin PII.
- **Estimado:** ~1 h.

**Paso 2.8.10 — Alineamiento con el globo**

- [ ] Verificar que los puntos coinciden con la proyección del globo.
- **Criterio:** hotspots en la posición geográfica correcta.
- **Estimado:** ~1.5 h.

**Paso 2.8.11 — Documentar TTL/retención del módulo**

- [ ] Registrar TTL 300 s y retención 90 d en el doc técnico.
- **Criterio:** doc coherente con la implementación.
- **Estimado:** ~1 h.

**Paso 2.8.12 — HUD contra el store**

- [ ] Verificar que el HUD refleja el estado real del store.
- **Criterio:** contador/ultima actualización correctos.
- **Estimado:** ~1 h.

**Paso 2.8.13 — Regresión sobre F0/F1**

- [ ] Ejecutar suite de etapas anteriores.
- **Criterio:** sin regresiones en la plataforma/globo.
- **Estimado:** ~1.5 h.

## 5. FASE 3 — Módulo Sismos (USGS) — Corte Vertical Completo

> **Objetivo:** Columna cilíndrica por sismo + animación de ondas de choque, con su backend, persistencia, Octree (Worker 2) y HUD mínimo. Mismo patrón de la Fase 2.

> **Duración:** 8 jornadas (~48 h). **Depende de:** Fases 0, 1 y 2 (reusa el patrón; puede avanzar en paralelo con el testeo de la Fase 2). **RF:** RF-07, RF-08. **RNF:** RNF-02, RNF-03.

> **Ruta de ejecución:** 9 grupos · 27 micro-pasos.

### Pasos

**Paso 3.1 — Backend: endpoint `/api/earthquakes`**

**Paso 3.1.1 — Parser de USGS y endpoint**

- [ ] Fetch del feed USGS (GeoJSON), normalización a contrato y endpoint paginado.
- **Criterio:** `/api/earthquakes` responde con los 7 campos del contrato; test con fixture.
- **Estimado:** ~2.25 h.

**Paso 3.1.2 — Filtros por magnitud y profundidad**

- [ ] `minmag`, `maxdepth`, bbox y rango de tiempo.
- **Criterio:** filtros validados y aplicados con tests.
- **Estimado:** ~1.75 h.

**Paso 3.1.3 — TTL y caché (300 s)**

- [ ] Caché Redis con TTL y fallback local.
- **Criterio:** 2.ª petición sirve desde caché sin API externa.
- **Estimado:** ~2.25 h.

**Paso 3.2 — Persistencia: tabla `earthquake`**

**Paso 3.2.1 — Migración e UPSERT por ID**

- [ ] Tabla `earthquake` (magnitude, depth, place, geom, occurred_at) con UPSERT por id USGS.
- **Criterio:** sin duplicados en ingestión; índices en magnitud/tiempo.
- **Estimado:** ~2.25 h.

**Paso 3.2.2 — Retención 365 días**

- [ ] Job de limpieza a 365 días.
- **Criterio:** viejos registros limpiados; log confirma el job.
- **Estimado:** ~1.25 h.

**Paso 3.3 — Worker 2: Octree de geolocalización**

**Paso 3.3.1 — Parseo y cartesianas**

- [ ] Worker 2 convierte lat/lon → coords cartesianas `[x,y,z]` y estructura los datos en Octree.
- **Criterio:** el CSV de muestra se parsea a coords cartesianas `[x,y,z]`.
- **Estimado:** ~2.25 h.

**Paso 3.3.2 — Queries espaciales (range cercano)**

- [ ] Consultas por rango (radio) sobre el Octree.
- **Criterio:** returns with bounding distances correctos; test de 1k puntos.
- **Estimado:** ~2.25 h.

**Paso 3.3.3 — Guard vs main thread idle**

- [ ] Garantizar que el cómputo vive en worker (main thread idle).
- **Criterio:** main thread con actividad mínima durante el procesado.
- **Estimado:** ~1.25 h.

**Paso 3.4 — Renderizado 3D de sismos**

**Paso 3.4.1 — Columnas cilíndricas por sismo**

- [ ] Cilindros (Instanced) con altura proporcional a magnitud.
- **Criterio:** cada sismo se ve como columna; altura legible vs magnitud.
- **Estimado:** ~2.75 h.

**Paso 3.4.2 — Ondas de choque animadas**

- [ ] Anillo/onda expansiva animada (shader) al destacar un evento.
- **Criterio:** la onda se propaga en tiempo y se desvanece; sin fugas de entidades.
- **Estimado:** ~2.25 h.

**Paso 3.5 — HUD mínimo de sismos**

**Paso 3.5.1 — Lista de recientes (top 10)**

- [ ] Panel con últimos sismos (mag, lugar, hora relativa).
- **Criterio:** la lista refleja el store y es responsive.
- **Estimado:** ~1.25 h.

**Paso 3.5.2 — Toggle de visualización**

- [ ] Switch mostrar/ocultar capa de sismos.
- **Criterio:** el toggle actualiza la capa y el HUD.
- **Estimado:** ~1.25 h.

**Paso 3.6 — Verificación E2E del módulo**

**Paso 3.6.1 — Recorrido con datos reales**

- [ ] Backend + worker + frontend con USGS real.
- **Criterio:** sismos reales visibles; columnas y onda coherentes con magnitud.
- **Estimado:** ~3.5 h.

**Paso 3.6.2 — Test de Octree contra carga**

- [ ] Benchmark de 5k puntos: parseo en worker; sin bloqueo.
- **Criterio:** procesado < 100 ms por lote; main thread libre.
- **Estimado:** ~2.25 h.

**Paso 3.6.3 — Commit del hito `feat/fase-3`**

- [ ] Commit con RF/RNF (RF-07, RF-08, RNF-02, RNF-03).
- **Criterio:** CI pasa; módulo demostrable.
- **Estimado:** ~1.25 h.

**Paso 3.7 (Opcional) — Umbral de leventes**

**Paso 3.7.1 — Umbral de magnitud configurable**

- [ ] Slider de magnitud mínima; re-filtra instancias.
- **Criterio:** el slider actualiza el render y el HUD sin recargar.
- **Estimado:** ~1.75 h.

**Paso 3.8 (Opcional) — EMSC**

**Paso 3.8.1 — Normalización de EMSC**

- [ ] Parser de la segunda fuente (EMSC) a contrato.
- **Criterio:** los eventos EMSC se normalizan igual que USGS.
- **Estimado:** ~2.25 h.

**Paso 3.8.2 — Fusión de fuentes**

- [ ] Merge no duplicante (ID) y visor de fuente.
- **Criterio:** sin duplicados; fuente identificable en el detalle.
- **Estimado:** ~2.25 h.

**Paso 3.9 — QA de sismos**

**Paso 3.9.1 — Contract test de `/api/earthquakes`**

- [ ] Test del contrato de respuesta (7 campos).
- **Criterio:** endpoint cumple el contrato.
- **Estimado:** ~1.75 h.

**Paso 3.9.2 — Test de filtros**

- [ ] Test de `minmag`/`maxdepth`/bbox/tiempo.
- **Criterio:** filtros validados con fixtures.
- **Estimado:** ~1.75 h.

**Paso 3.9.3 — Test del Octree (1k puntos)**

- [ ] Test de construcción y consulta por rango.
- **Criterio:** resultado y tiempos correctos.
- **Estimado:** ~1.75 h.

**Paso 3.9.4 — Test de columnas**

- [ ] Test del mapeo magnitud → altura.
- **Criterio:** proporción legible y sin distorsión.
- **Estimado:** ~1.25 h.

**Paso 3.9.5 — Test de la onda animada**

- [ ] Verificar propagación y desvanecimiento del anillo.
- **Criterio:** animación sin fugas de objetos.
- **Estimado:** ~1.25 h.

**Paso 3.9.6 — Cobertura del worker Octree**

- [ ] Alcanzar cobertura del worker ≥ 70 %.
- **Criterio:** umbral verificado.
- **Estimado:** ~1.75 h.

**Paso 3.9.7 — Mock de USGS**

- [ ] Fixture/mock del feed USGS.
- **Criterio:** tests sin red real.
- **Estimado:** ~1.25 h.

**Paso 3.9.8 — Documentar retención 365 d**

- [ ] Registrar retención de sismos en el doc técnico.
- **Criterio:** doc coherente con la implementación.
- **Estimado:** ~0.5 h.

**Paso 3.9.9 — Regresión sobre el globo y plataforma**

- [ ] Suite de fases anteriores en verde.
- **Criterio:** sin regresiones.
- **Estimado:** ~1.75 h.

## 6. FASE 4 — Módulo Viento (Open-Meteo + GPU) — Corte Vertical Completo

> **Objetivo:** Sistema de partículas de viento en GPU (Transform Feedback) desde la rejilla U/V, con su backend, persistencia y HUD mínimo. Capa cuyo peso técnico vive en Worker 3 + shaders.

> **Duración:** 9 jornadas (~54 h). **Depende de:** Fases 0, 1 y 2. **RF:** RF-05, RF-06. **RNF:** RNF-01, RNF-03.

> **Ruta de ejecución:** 9 grupos · 33 micro-pasos.

### Pasos

**Paso 4.1 — Backend: rejilla U/V de Open-Meteo**

**Paso 4.1.1 — Fetch y parseo de rejilla U/V**

- [ ] Fetch del modelo (U-V grid), redondeo y empaquetado en formato compacto.
- **Criterio:** la rejilla se descarga y se transforma a U/V arrays.
- **Estimado:** ~2 h.

**Paso 4.1.2 — Almacenamiento en caché rápida**

- [ ] Guardar rejilla en caché rápida (Redis) con TTL 900 s y fallback local.
- **Criterio:** 2.ª petición sin descarga; fallback local en ausencia de Redis.
- **Estimado:** ~2 h.

**Paso 4.2 — Persistencia: tabla `wind_grid`**

**Paso 4.2.1 — Migración y storage de rejillas**

- [ ] Tabla `wind_grid` (time, resolution, u/v) con índice por tiempo.
- **Criterio:** almacena una rejilla y la consulta posterior responde.
- **Estimado:** ~1.5 h.

**Paso 4.2.2 — Retención 90 días**

- [ ] Job de limpieza por antigüedad de rejillas.
- **Criterio:** rejillas viejas eliminadas según política.
- **Estimado:** ~1 h.

**Paso 4.3 (Opcional) — Celosías de alta resolución**

**Paso 4.3.1 — Rejilla de alta resolución regional**

- [ ] Segunda rejilla de mayor resolución para región focal.
- **Criterio:** al hacer zoom se muestra la región con más detalle U/V.
- **Estimado:** ~2 h.

**Paso 4.3.2 — Fusión de resoluciones**

- [ ] Combinar ambas rejillas con blending suave.
- **Criterio:** transición de resolución sin saltos visibles.
- **Estimado:** ~1.5 h.

**Paso 4.4 — Worker 3: GPU (Transform Feedback)**

**Paso 4.4.1 — Interpolación de la rejilla**

- [ ] Worker 3 preprocesa U/V e interpola velocidades en las posiciones del sistema.
- **Criterio:** las velocidades interpoladas coinciden con muestras de control.
- **Estimado:** ~2 h.

**Paso 4.4.2 — Transform Feedback (positions en GPU)**

- [ ] VBO de posiciones (alrededor de la capa atmosférica), feedback loop y viento estéticamente coherente.
- **Criterio:** el viento se mueve en la dirección correcta; GPU mantiene 60 FPS con ~18k partículas.
- **Estimado:** ~4 h.

**Paso 4.5 — Renderizado de viento**

**Paso 4.5.1 — Shader de partículas con estela**

- [ ] Particle shader con trazo (estela) y opacidad según velocidad.
- **Criterio:** partículas con estela; velocidad visible; bajo draw cost.
- **Estimado:** ~3 h.

**Paso 4.5.2 — Capas de altura (10m / 80m / 100hPa)**

- [ ] Selector de altura que cambia la capa renderizada.
- **Criterio:** cambiar altura actualiza la dirección y densidad; sin recrear todo el sistema.
- **Estimado:** ~2.5 h.

**Paso 4.6 — HUD mínimo de viento**

**Paso 4.6.1 — Indicador de velocidad y dirección**

- [ ] Mini panel: km/h promedio y rosa de viento.
- **Criterio:** valores cuadran con la capa activa.
- **Estimado:** ~1.5 h.

**Paso 4.7 — Verificación E2E del módulo**

**Paso 4.7.1 — Recorrido con Open-Meteo real**

- [ ] Backend + worker + GPU con datos reales.
- **Criterio:** viento real visible y coherente con el mapa de referencia.
- **Estimado:** ~3 h.

**Paso 4.7.2 — Benchmark GPU (18k partículas)**

- [ ] Perfil de FPS y VRAM con el sistema activo.
- **Criterio:** ≥ 55 FPS con 18k; sin fugas VRAM en 5 min.
- **Estimado:** ~2 h.

**Paso 4.7.3 — Commit del hito `feat/fase-4`**

- [ ] Commit con RF/RNF (RF-05, RF-06, RNF-01, RNF-03).
- **Criterio:** CI pasa; módulo demostrable.
- **Estimado:** ~1 h.

**Paso 4.8 (Opcional) — Filtro de densidad y colores**

**Paso 4.8.1 — Densidad configurable**

- [ ] Slider de densidad de partículas (re-build del VBO).
- **Criterio:** la densidad cambia el sistema sin parpadeos.
- **Estimado:** ~1 h.

**Paso 4.8.2 — Color según velocidad**

- [ ] Gradientes de color (frío → cálido) según velocidad.
- **Criterio:** el color se correlaciona con la velocidad real.
- **Estimado:** ~1 h.

**Paso 4.9 — QA de viento**

**Paso 4.9.1 — Contract test de la rejilla**

- [ ] Test del contrato de la rejilla U/V.
- **Criterio:** estructura U/V correcta.
- **Estimado:** ~1.5 h.

**Paso 4.9.2 — Test de interpolación**

- [ ] Muestras de control para la interpolación de velocidades.
- **Criterio:** interpolación coincide con muestras.
- **Estimado:** ~1.5 h.

**Paso 4.9.3 — Test de caché 900 s**

- [ ] Verificar TTL de caché de la rejilla.
- **Criterio:** 2.ª petición sin descarga.
- **Estimado:** ~1 h.

**Paso 4.9.4 — Mock de Open-Meteo**

- [ ] Fixture/mock del modelo U/V.
- **Criterio:** tests sin red real.
- **Estimado:** ~1 h.

**Paso 4.9.5 — Benchmark de 18k partículas**

- [ ] Medir FPS con 18k partículas.
- **Criterio:** ≥ 55 FPS sostenidos.
- **Estimado:** ~2 h.

**Paso 4.9.6 — Perfil del feedback loop**

- [ ] Perfilar Transform Feedback (GPU).
- **Criterio:** cuello de botella identificado si lo hay.
- **Estimado:** ~2 h.

**Paso 4.9.7 — Medición de VRAM**

- [ ] Registrar memoria GPU con el sistema activo.
- **Criterio:** sin crecimiento sostenido en 5 min.
- **Estimado:** ~1.5 h.

**Paso 4.9.8 — Test de cambio de altura**

- [ ] Cambio de capa (10m/80m/100hPa) sin reinicio ruidoso.
- **Criterio:** el cambio actualiza dirección/densidad.
- **Estimado:** ~1 h.

**Paso 4.9.9 — Test visual de estelas**

- [ ] Revisión visual de las estelas de partículas.
- **Criterio:** estela direccional y legible.
- **Estimado:** ~1 h.

**Paso 4.9.10 — Fallback CPU (WebGL1)**

- [ ] Sistema de partículas en CPU si no hay GPU/Transform Feedback.
- **Criterio:** el viento se ve (menor densidad) sin GPU.
- **Estimado:** ~2 h.

**Paso 4.9.11 — Documentar límites de resolución**

- [ ] Registrar resolución/máx partículas soportadas.
- **Criterio:** límites documentados.
- **Estimado:** ~1 h.

**Paso 4.9.12 — Regresión sobre fases 1-3**

- [ ] Suite de etapas anteriores en verde.
- **Criterio:** sin regresiones.
- **Estimado:** ~1.5 h.

**Paso 4.9.13 — Documentar TTL del viento**

- [ ] Registrar TTL 900 s en el doc técnico.
- **Criterio:** doc coherente.
- **Estimado:** ~0.5 h.

**Paso 4.9.14 — Verificación del HUD mínimo**

- [ ] Panel de viento cuadra con la capa activa.
- **Criterio:** km/h y rosa de viento correctos.
- **Estimado:** ~1 h.

**Paso 4.9.15 — Logs del worker de viento**

- [ ] Instrumentar worker GPU/CPU.
- **Criterio:** logs de carga y fallback.
- **Estimado:** ~1 h.

**Paso 4.9.16 — Matriz GPU (desktop/mobile)**

- [ ] Probar en iGPU y GPU dedicada.
- **Criterio:** compatibilidad documentada.
- **Estimado:** ~1.5 h.

**Paso 4.9.17 — Baseline FPS registrado**

- [ ] Guardar baseline de FPS del módulo.
- **Criterio:** baseline versionado.
- **Estimado:** ~1 h.

## 7. FASE 5 — Módulo Inundación (Nivel del Mar) — Corte Vertical Completo

> **Objetivo:** Shader de agua con slider +0m a +10m que enmascara zonas costeras sumergidas, más el servicio de **elevación puntual** que el globo y el HUD necesitan.

> **Duración:** 6 jornadas (~36 h). **Depende de:** Fase 1 (globo) y Fase 2 (patrón backend). **RF:** RF-09, RF-10. **RNF:** RNF-01.

> **Ruta de ejecución:** 8 grupos · 21 micro-pasos.

### Pasos

**Paso 5.1 — Backend: elevación puntual por lon/lat**

**Paso 5.1.1 — Endpoint de elevación (`/api/elevation`)**

- [ ] Endpoint que dado lon/lat devuelve altitud (desde SRTM/GMTED) con caché Redis.
- **Criterio:** `curl /api/elevation?lat=-12&lng=-77` devuelve altitud; TTL aplicado.
- **Estimado:** ~2 h.

**Paso 5.1.2 — Batch para polígonos costeros**

- [ ] Endpoint batch que precalcula elevaciones de polígonos (para máscara costera).
- **Criterio:** batch responde N puntos en una llamada; limite validado.
- **Estimado:** ~2 h.

**Paso 5.2 — Persistencia: tabla `sea_level`**

**Paso 5.2.1 — Migración de subidas**

- [ ] Tabla `sea_level` (time, rise_m, geojson) con reemplazo por fecha.
- **Criterio:** UPSERT por fecha no duplica; query por rango responde.
- **Estimado:** ~1.5 h.

**Paso 5.2.2 — Series históricas (datos administrativos)**

- [ ] Ingestión de series oficiales de subida de nivel del mar (referencia pública).
- **Criterio:** serie presente y graficable; retención 30 días para datos crudos.
- **Estimado:** ~2 h.

**Paso 5.3 — Worker de máscara costera**

**Paso 5.3.1 — Precompute de zonas inundables (+0 a +10 m)**

- [ ] Worker que calcula polígonos inundables por incremento (1 m, 5 m, 10 m).
- **Criterio:** polígono para +5 m en una ciudad costera coincide con la referencia.
- **Estimado:** ~3.25 h.

**Paso 5.3.2 — Publicación en caché (precompute)**

- [ ] Resultado precomputado se cachea (TTL largo) y se sirve en streaming.
- **Criterio:** el caché responde incluso sin el worker activo.
- **Estimado:** ~1.5 h.

**Paso 5.4 — Shader de inundación**

**Paso 5.4.1 — Fragment shader con máscara de altura**

- [ ] Shader que muestra en qué zonas el nivel de mar supera la elevación.
- **Criterio:** subir el slider colorea las zonas sumergidas en el globo.
- **Estimado:** ~3.25 h.

**Paso 5.4.2 — Slider +0 m a +10 m**

- [ ] Slider en HUD que controla el incremento; suavizado de la transición.
- **Criterio:** slider recorre 0-10 m con transición suave y sin lag.
- **Estimado:** ~1.5 h.

**Paso 5.5 — HUD mínimo de inundación**

**Paso 5.5.1 — Lectura de nivel actual + área afectada**

- [ ] Panel con el nivel seleccionado y km² afectados (estimación por polígono).
- **Criterio:** el panel cuadra con el slider y el render.
- **Estimado:** ~1.5 h.

**Paso 5.6 (Opcional) — Datos vectoriales de ciudades costeras**

**Paso 5.6.1 — Capa de ciudades costeras**

- [ ] Marcadores de ciudades costeras con elevación media.
- **Criterio:** las ciudades se ven y la elevación mostrada es correcta.
- **Estimado:** ~1.5 h.

**Paso 5.6.2 — Risk rank simple**

- [ ] Ranking de ciudades por riesgo (elevación baja + población).
- **Criterio:** el ranking ordena por riesgo y es estable.
- **Estimado:** ~1.5 h.

**Paso 5.7 — Verificación E2E del módulo**

**Paso 5.7.1 — Recorrido con elevación real**

- [ ] Backend + worker + shader con datos reales de elevación.
- **Criterio:** zonas costeras plausibles se inundan al subir el nivel; el render responde.
- **Estimado:** ~3.25 h.

**Paso 5.7.2 — Commit del hito `feat/fase-5`**

- [ ] Commit con RF/RNF (RF-09, RF-10, RNF-01).
- **Criterio:** CI pasa; módulo demostrable.
- **Estimado:** ~1 h.

**Paso 5.8 — QA de inundación**

**Paso 5.8.1 — Contract test de `/api/elevation`**

- [ ] Test del contrato de elevación.
- **Criterio:** endpoint cumple contrato con TTL.
- **Estimado:** ~1 h.

**Paso 5.8.2 — Test del batch de polígonos**

- [ ] Test del endpoint batch de elevaciones.
- **Criterio:** batch responde N puntos y valida límites.
- **Estimado:** ~1 h.

**Paso 5.8.3 — Mock de SRTM/GMTED**

- [ ] Fixture/mock de elevación.
- **Criterio:** tests sin red real.
- **Estimado:** ~1 h.

**Paso 5.8.4 — Test de máscara +5 m**

- [ ] Comparar polígono de +5 m contra referencia conocida.
- **Criterio:** máscara coincide con la referencia.
- **Estimado:** ~1.5 h.

**Paso 5.8.5 — Test visual del shader de agua**

- [ ] Regresión visual del enmascarado del shader.
- **Criterio:** zonas sumergidas correctamente coloreadas.
- **Estimado:** ~1.5 h.

**Paso 5.8.6 — Cobertura del worker de máscara**

- [ ] Cobertura del precompute ≥ 70 %.
- **Criterio:** umbral verificado.
- **Estimado:** ~1.5 h.

**Paso 5.8.7 — Regresión sobre fases 1-4**

- [ ] Suite de etapas anteriores en verde.
- **Criterio:** sin regresiones.
- **Estimado:** ~1.5 h.

**Paso 5.8.8 — Documentar retención 30 d**

- [ ] Registrar retención de datos crudos de mar.
- **Criterio:** doc coherente.
- **Estimado:** ~0.5 h.

## 8. FASE 6 — Módulo Radiación (Safecast, EURDEP, RadNet, GMCMap) — Corte Vertical Completo

> **Objetivo:** Sensores radiológicos con umbrales de alerta GLSL (normal/elevated/critical) y parpadeo crítico, con normalización de 4 fuentes en backend y persistencia.

> **Duración:** 7 jornadas (~42 h). **Depende de:** Fases 0, 1 y 2. **RF:** RF-13, RF-14. **RNF:** RNF-02, RNF-03, RNF-04.

> **Ruta de ejecución:** 7 grupos · 22 micro-pasos.

### Pasos

**Paso 6.1 — Backend: 4 fuentes + normalización**

**Paso 6.1.1 — Parser Safecast**

- [ ] Ingestion y normalización de Safecast (µSv/h) al contrato.
- **Criterio:** fixture Safecast parseado correctamente (unidades y ubicación).
- **Estimado:** ~2.5 h.

**Paso 6.1.2 — Parser EURDEP**

- [ ] Ingestion y normalización de EURDEP.
- **Criterio:** fixture EURDEP parseado; unidades coherentes.
- **Estimado:** ~2.5 h.

**Paso 6.1.3 — Parser RadNet y GMCMap**

- [ ] Ingestion de RadNet (US EPA) y GMCMap.
- **Criterio:** ambos fixtures parseados al mismo formato.
- **Estimado:** ~2.5 h.

**Paso 6.1.4 — Normalización de unidades**

- [ ] Conversión/etiquetado común (µSv/h) y dedupe por sensor.
- **Criterio:** todas las fuentes responden en la misma unidad y sin duplicados.
- **Estimado:** ~2.5 h.

**Paso 6.1.5 — TTL y caché (300 s)**

- [ ] Caché Redis + fallback local.
- **Criterio:** 2.ª petición sin tocar las 4 fuentes externas.
- **Estimado:** ~1.75 h.

**Paso 6.2 — Persistencia: tabla `radiation`**

**Paso 6.2.1 — Migración con fuente y unidad**

- [ ] Tabla `radiation` (value_uSv, sensor, source, captured_at, geom) con índice por sensor.
- **Criterio:** consulta por sensor es rápida; ingestión no duplica.
- **Estimado:** ~2.5 h.

**Paso 6.2.2 — Retención según política (31-365 según fuente)**

- [ ] Job de limpieza con política por fuente.
- **Criterio:** viejos datos eliminados según su fuente.
- **Estimado:** ~1.25 h.

**Paso 6.3 — Worker de fusión para umbrales**

**Paso 6.3.1 — Cálculo de umbrales en worker**

- [ ] Worker que agrupa por sensor y calcula normal/elevated/critical según rangos.
- **Criterio:** los umbrales (normal/elevated/critical) son correctos contra fixture.
- **Estimado:** ~2.5 h.

**Paso 6.3.2 — Buffering y realtime feed**

- [ ] Feed en tiempo real (SSE/WS) para cambios de umbral.
- **Criterio:** un cambio de umbral llega al cliente en < 2 s.
- **Estimado:** ~2.5 h.

**Paso 6.4 — Renderizado: umbrales GLSL + parpadeo**

**Paso 6.4.1 — Shader de umbrales (normal/elevated/critical)**

- [ ] Material que colorea por estado en shader (sin re-build).
- **Criterio:** los tres estados son visualmente distinguibles.
- **Estimado:** ~3 h.

**Paso 6.4.2 — Parpadeo crítico**

- [ ] Seno temporal para parpadeo de sensores críticos.
- **Criterio:** los criticals parpadean; desactivado al pausar.
- **Estimado:** ~1.25 h.

**Paso 6.5 — HUD mínimo de radiación**

**Paso 6.5.1 — Panel de lecturas (µSv/h)**

- [ ] Panel con el máximo y la distribución por estado.
- **Criterio:** números cuadran con el store y las fuentes.
- **Estimado:** ~1.25 h.

**Paso 6.5.2 — Indicador de alarma crítica**

- [ ] Badge/indicador cuando hay criticals (con sonido sutil en HUD).
- **Criterio:** el indicador aparece cuando hay criticals.
- **Estimado:** ~1.25 h.

**Paso 6.6 — Verificación E2E del módulo**

**Paso 6.6.1 — Recorrido con las 4 fuentes**

- [ ] Backend + worker + shader con las 4 fuentes reales.
- **Criterio:** los 4 orígenes se ven normalizados en el globo.
- **Estimado:** ~3.5 h.

**Paso 6.6.2 — Commit del hito `feat/fase-6`**

- [ ] Commit con RF/RNF (RF-13, RF-14, RNF-02, RNF-03, RNF-04).
- **Criterio:** CI pasa; módulo demostrable.
- **Estimado:** ~1.25 h.

**Paso 6.7 — QA de radiación**

**Paso 6.7.1 — Contract test de las 4 fuentes**

- [ ] Test del contrato de normalización.
- **Criterio:** las 4 fuentes cumplen el contrato.
- **Estimado:** ~1.75 h.

**Paso 6.7.2 — Test de dedupe por sensor**

- [ ] Test de merge sin duplicados.
- **Criterio:** un sensor aparece una vez.
- **Estimado:** ~1.25 h.

**Paso 6.7.3 — Mocks de las 4 fuentes**

- [ ] Fixtures de Safecast/EURDEP/RadNet/GMCMap.
- **Criterio:** tests sin red real.
- **Estimado:** ~1.75 h.

**Paso 6.7.4 — Test de umbrales**

- [ ] Validar normal/elevated/critical contra fixture.
- **Criterio:** etiquetado correcto por rango.
- **Estimado:** ~1.75 h.

**Paso 6.7.5 — Test del parpadeo crítico**

- [ ] Verificar parpadeo y pausa.
- **Criterio:** parpadeo correcto y pausable.
- **Estimado:** ~1.25 h.

**Paso 6.7.6 — Cobertura del worker de fusión**

- [ ] Cobertura ≥ 70 % del worker.
- **Criterio:** umbral verificado.
- **Estimado:** ~1.75 h.

**Paso 6.7.7 — Regresión y retención documentada**

- [ ] Suite de fases anteriores + doc de retención.
- **Criterio:** sin regresiones; retención coherente.
- **Estimado:** ~1.25 h.

## 9. FASE 7 — HUD Analítico, Interacción y Time-Scrubber

> **Objetivo:** Clic → telemetría (RF-11), toggles de capas y filtro temporal (RF-12), feed de alertas y re-filtrado con limpieza de VRAM. **Transversal**: pulsa y completa los HUD mínimos construidos en las Fases 2–6.

> **Duración:** 6 jornadas (~36 h). **Depende de:** Fases 2–6 (todas las capas). **RF:** RF-11, RF-12. **RNF:** RNF-04.

> **Ruta de ejecución:** 8 grupos · 20 micro-pasos.

### Pasos

**Paso 7.1 — Time-scrubber global**

**Paso 7.1.1 — Slider temporal con play/pause**

- [ ] Slider de tiempo (24 h / 7 d / 30 d) con play/pause y reproducción.
- **Criterio:** el slider avanza en el tiempo y los datos cambian de forma fluida.
- **Estimado:** ~2.75 h.

**Paso 7.1.2 — Caché temporal en client**

- [ ] Cachear frames por timestamp para no re-fetch al navegar.
- **Criterio:** volver a un frame ya visto no dispara red.
- **Estimado:** ~2 h.

**Paso 7.2 — Toggles de capas**

**Paso 7.2.1 — Panel de capas (fires/quakes/wind/sea/rad)**

- [ ] Toggle individual con estado persistente en store.
- **Criterio:** todos los toggles cambian la visibilidad sin recargar.
- **Estimado:** ~2 h.

**Paso 7.2.2 — Persistencia de preferencias**

- [ ] Guardar preferencias en localStorage (JSON anon).
- **Criterio:** recargar conserva los toggles.
- **Estimado:** ~1 h.

**Paso 7.3 — Clic y telemetría (RF-11)**

**Paso 7.3.1 — Raycast con detalles del punto**

- [ ] Clic en el globo → panel con datos del punto (magnitud/FRP/µSv/h).
- **Criterio:** el panel muestra datos correctos del punto seleccionado.
- **Estimado:** ~2.25 h.

**Paso 7.3.2 — Histórico del punto**

- [ ] Mini-gráfica de la serie del punto seleccionado.
- **Criterio:** la gráfica refleja la serie de la capa activa.
- **Estimado:** ~2 h.

**Paso 7.4 — Feed de alertas**

**Paso 7.4.1 — Feed de eventos (fire/quakes/rad alarmas)**

- [ ] Panel con últimos eventos y alertas con Severidad.
- **Criterio:** los eventos se ordenan por tiempo y severidad.
- **Estimado:** ~2 h.

**Paso 7.4.2 — Filtros por gravedad**

- [ ] Filtro de severidad (todas/elevadas/críticas).
- **Criterio:** el filtro actualiza el feed y el render (re-filtrado).
- **Estimado:** ~1.5 h.

**Paso 7.4.3 — Limpieza de VRAM al re-filtrar**

- [ ] Al filtrar, liberar instancias/mallas no usadas (dispose).
- **Criterio:** DevTools muestra memoria estable tras múltiples filtros.
- **Estimado:** ~2.25 h.

**Paso 7.5 — Completar HUDs de módulos (pulido transversal)**

**Paso 7.5.1 — Unificar estilo de paneles**

- [ ] Componentes HUD compartidos (panel, leyenda, badge) aplicados a los 5 módulos.
- **Criterio:** todos los HUDs usan los mismos componentes y estética.
- **Estimado:** ~2.75 h.

**Paso 7.5.2 — Estados vacíos y carga**

- [ ] Skeleton/empty/error states por módulo.
- **Criterio:** cada módulo muestra su estado correctamente (loading/error/vacío).
- **Estimado:** ~2 h.

**Paso 7.6 (Opcional) — Heatmap radiológico**

**Paso 7.6.1 — Heatmap agregado de radiación**

- [ ] Agregación por grilla con gradiente (µSv/h promedio).
- **Criterio:** heatmap cuadra con los puntos individuales.
- **Estimado:** ~2.25 h.

**Paso 7.6.2 — Leyenda de heatmap**

- [ ] Leyenda específica (diferenciable del gradiente FRP).
- **Criterio:** la leyenda se distingue de la de incendios.
- **Estimado:** ~1 h.

**Paso 7.7 — Verificación E2E de interacción**

**Paso 7.7.1 — Recorrido con las 5 capas activas**

- [ ] Probar time-scrubber + toggles + clic + feed con todas las capas.
- **Criterio:** interacción conjunta estable; sin fugas VRAM; 60 FPS.
- **Estimado:** ~2.75 h.

**Paso 7.7.2 — Commit del hito `feat/fase-7`**

- [ ] Commit con RF/RNF (RF-11, RF-12, RNF-04).
- **Criterio:** CI pasa; HUD transversal demostrable.
- **Estimado:** ~1 h.

**Paso 7.8 — QA de interacción**

**Paso 7.8.1 — Test del time-scrubber**

- [ ] Test de reproducción y salto de frames.
- **Criterio:** re-produce y va a frames cacheados.
- **Estimado:** ~1.5 h.

**Paso 7.8.2 — Test de toggles con persistencia**

- [ ] Test de visibilidad + localStorage.
- **Criterio:** recargar conserva las preferencias.
- **Estimado:** ~1 h.

**Paso 7.8.3 — Test de raycast → telemetría**

- [ ] Verificar datos del punto al hacer clic.
- **Criterio:** panel muestra los datos correctos.
- **Estimado:** ~1.5 h.

**Paso 7.8.4 — Test del feed de alertas**

- [ ] Orden y filtros del feed.
- **Criterio:** severidad y filtros correctos.
- **Estimado:** ~1 h.

**Paso 7.8.5 — Regresión de VRAM tras re-filtros**

- [ ] Memoria estable tras múltiples filtros.
- **Criterio:** sin fugas en DevTools.
- **Estimado:** ~2 h.

## 10. FASE 8 — Resiliencia End-to-End y Modo Resguardo

> **Objetivo:** La cadena Redis → API → local del backend se refleja de extremo a extremo en el HUD (RNF-05) y todo el cómputo pesado vive en workers (RNF-03).

> **Duración:** 4 jornadas (~24 h). **Depende de:** Fases 2–6 (los fallbacks por módulo ya existen). **RF/RNF:** RNF-03, RNF-05.

> **Ruta de ejecución:** 5 grupos · 9 micro-pasos.

### Pasos

**Paso 8.1 — Orquestador de conexión**

**Paso 8.1.1 — Estado global de conectividad**

- [ ] Store con estado de conexión (online/redis/api/local).
- **Criterio:** el HUD refleja el estado real de la cadena de datos.
- **Estimado:** ~2.5 h.

**Paso 8.1.2 — Timeouts y degradación elegante**

- [ ] Encadenar radio de contingencias: Redis → API → local (backend), y en el HUD indicador de resguardo.
- **Criterio:** cada caída cambia de fuente sin romper la UI.
- **Estimado:** ~4 h.

**Paso 8.2 — Indicadores en el HUD**

**Paso 8.2.1 — Badge de modo resguardo**

- [ ] Indicador visual cuando se sirve desde fallback.
- **Criterio:** en modo resguardo el HUD lo muestra.
- **Estimado:** ~1.25 h.

**Paso 8.2.2 — Log de eventos de resiliencia**

- [ ] Registro de cambios de fuente (últimos 20 en el panel de estado).
- **Criterio:** el log ordena por tiempo los cambios.
- **Estimado:** ~2 h.

**Paso 8.3 — Cómputo pesado en workers (auditoría)**

**Paso 8.3.1 — Auditoría de bloqueos de main thread**

- [ ] Profiling para detectar tareas pesadas (parsing, clustering) en main thread y migrarlas al worker.
- **Criterio:** no hay tareas > 16 ms en main thread durante carga/refiltro.
- **Estimado:** ~4 h.

**Paso 8.4 — Verificación E2E de resiliencia**

**Paso 8.4.1 — Simulación de caídas (Redis, API externa, red)**

- [ ] Derribar cada eslabón por turno y verificar comportamiento.
- **Criterio:** la app sigue operativa en modo resguardo en cada caso.
- **Estimado:** ~4 h.

**Paso 8.4.2 — Commit del hito `feat/fase-8`**

- [ ] Commit con RNF-03, RNF-05.
- **Criterio:** CI pasa; resiliencia demostrable.
- **Estimado:** ~1.25 h.

**Paso 8.5 — Tests de resiliencia**

**Paso 8.5.1 — Test de degradación por eslabón**

- [ ] Test de cada caída (Redis/API/red) con respuesta de resguardo.
- **Criterio:** cada escenario responde sin romper la UI.
- **Estimado:** ~2.5 h.

**Paso 8.5.2 — Verificación de main thread idle**

- [ ] Test que mide bloqueos > 16 ms en carga/refiltro.
- **Criterio:** sin bloqueos detectados.
- **Estimado:** ~2.5 h.

## 11. FASE 9 — Seguridad y Privacidad (Hardening)

> **Objetivo:** Completar [GAIA_SECURITY](./GAIA_SECURITY.md): la base (CORS, rate-limit global, headers, sesión cookie) ya está en la Fase 0 y los rate limits por módulo en sus fases. Aquí se cierra DDoS, CSP/nonce, XSS end-to-end y auditorías.

> **Duración:** 4 jornadas (~24 h). **Depende de:** Fase 0 (base) y Fases 2–6 (rate limits por módulo). **RNF:** RNF-07 (parcial), GDPR/privacidad.

> **Ruta de ejecución:** 6 grupos · 20 micro-pasos.

### Pasos

**Paso 9.1 — Hardening DDoS y rate-limit avanzado**

**Paso 9.1.1 — Rate limits por módulo**

- [ ] Configurar límites específicos por endpoint/module.
- **Criterio:** cada módulo tiene su límite; test por módulo.
- **Estimado:** ~1.5 h.

**Paso 9.1.2 — Bloqueo de picos y lista de origen**

- [ ] Detección de picos anómalos (por IP/UA) y bloqueo temporal.
- **Criterio:** simulando pico, la IP recibe bloqueo controlado.
- **Estimado:** ~1.75 h.

**Paso 9.1.3 — Headers de protección (CSP, nonce, HSTS)**

- [ ] CSP con nonce para scripts, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Criterio:** `curl -I` muestra los headers; CSP no rompe la app.
- **Estimado:** ~2.25 h.

**Paso 9.2 — Seguridad en sesión y cookies**

**Paso 9.2.1 — Rotación de sesión**

- [ ] Re-hash periódico (regenerar token) y expiración por inactividad.
- **Criterio:** sesión rota al tiempo definido; invalidación correcta.
- **Estimado:** ~1.5 h.

**Paso 9.2.2 — Inspección de atributos en prod**

- [ ] Verificar Secure, SameSite, HttpOnly en producción (prueba en staging).
- **Criterio:** cookies con atributos correctos en staging.
- **Estimado:** ~0.75 h.

**Paso 9.3 — Sanitización y XSS**

**Paso 9.3.1 — Sanitización de inputs**

- [ ] Validar/sanitizar todos los parámetros de búsqueda y body.
- **Criterio:** payloads maliciosos rechazados/neutralizados (test).
- **Estimado:** ~1.5 h.

**Paso 9.3.2 — Auditoría XSS (datos de terceros)**

- [ ] Revisión de puntos de renderizado de datos de API externa.
- **Criterio:** sin XSS demostrable en los puntos revisados.
- **Estimado:** ~1 h.

**Paso 9.4 — Auditorías y registro**

**Paso 9.4.1 — Auditoría de dependencias**

- [ ] `npm audit` y revisión de vulnerabilidades con policy de autofix.
- **Criterio:** sin vulnerabilidades críticas o alta sin plan.
- **Estimado:** ~1 h.

**Paso 9.4.2 — Logs de seguridad**

- [ ] Loggear eventos de seguridad (rate-limit, bloqueos, validaciones fallidas).
- **Criterio:** logs de seguridad tipados y sin PII.
- **Estimado:** ~1.5 h.

**Paso 9.5 — Verificación E2E de seguridad**

**Paso 9.5.1 — Checklist de seguridad completo**

- [ ] Recorrer el checklist de [GAIA_SECURITY](./GAIA_SECURITY.md).
- **Criterio:** todos los puntos del checklist verificados.
- **Estimado:** ~2.25 h.

**Paso 9.5.2 — Commit del hito `feat/fase-9`**

- [ ] Commit con RNF-07 parcial y GDPR/privacidad.
- **Criterio:** CI pasa; auditoría lista.
- **Estimado:** ~0.75 h.

**Paso 9.6 — Tests de seguridad**

**Paso 9.6.1 — Test de rate limits por módulo**

- [ ] Test de los límites por endpoint (60/60/30/30/120).
- **Criterio:** superar límite → 429 con código correcto.
- **Estimado:** ~1 h.

**Paso 9.6.2 — Test de bloqueo por pico**

- [ ] Test de detección y bloqueo de picos anómalos.
- **Criterio:** la IP bloqueada recibe respuesta controlada.
- **Estimado:** ~1 h.

**Paso 9.6.3 — Test de headers CSP/nonce**

- [ ] Verificar headers de seguridad en todas las respuestas.
- **Criterio:** curl muestra CSP/HSTS/Ref-Policy; app no rota.
- **Estimado:** ~1 h.

**Paso 9.6.4 — Test de rotación de sesión**

- [ ] Test de regeneración del token y expiración.
- **Criterio:** sesión rota en el tiempo definido.
- **Estimado:** ~1 h.

**Paso 9.6.5 — Test de sanitización XSS**

- [ ] Payloads maliciosos neutralizados.
- **Criterio:** sin ejecución de payloads en los puntos de render.
- **Estimado:** ~1.5 h.

**Paso 9.6.6 — Scan de dependencias en CI**

- [ ] `npm audit` como gate del CI.
- **Criterio:** CI bloquea si hay vulnerabilidades críticas.
- **Estimado:** ~0.75 h.

**Paso 9.6.7 — Test de cookie en staging**

- [ ] Verificar atributos Secure/SameSite/HttpOnly en staging.
- **Criterio:** atributos correctos en staging.
- **Estimado:** ~0.75 h.

**Paso 9.6.8 — Revisión de logs de seguridad**

- [ ] Verificar que no hay PII en los logs de seguridad.
- **Criterio:** logs tipados y sin PII.
- **Estimado:** ~0.75 h.

**Paso 9.6.9 — Actualizar GAIA_SECURITY**

- [ ] Reflejar resultados de los tests en el checklist.
- **Criterio:** checklist actualizado.
- **Estimado:** ~0.75 h.

## 12. FASE 10 — Optimización 60 FPS y Memoria GPU

> **Objetivo:** Cumplir RNF-01 (60 FPS con >20k datos), RNF-02 (≤8 draw calls) y RNF-04 (cero fugas VRAM). Los módulos ya respetan los presupuestos por construcción; aquí se afinan y se documentan los límites reales.

> **Duración:** 8 jornadas (~48 h). **Depende de:** Fases 1–6. **RNF:** RNF-01, RNF-02, RNF-04.

> **Ruta de ejecución:** 6 grupos · 15 micro-pasos.

### Pasos

**Paso 10.1 — Instrumentación de perfiles**

**Paso 10.1.1 — Perfil de frame (FPS, p95, draw calls)**

- [ ] HUD de desarrollo que mide FPS/p95, draw calls y memoria GPU en tiempo real.
- **Criterio:** se ven métricas completas en el HUD de dev; ocultables en prod.
- **Estimado:** ~4.5 h.

**Paso 10.1.2 — Línea base por capa**

- [ ] Benchmark por módulo/capa (fires, quakes, wind, sea, rad).
- **Criterio:** documento de límites reales por capa.
- **Estimado:** ~3 h.

**Paso 10.2 — Optimización de draw calls (≤ 8) y VRAM**

**Paso 10.2.1 — Reducción de draw calls**

- [ ] Unificar materiales/geometrías por capa; objetivo ≤ 8 draw calls en escena con todas las capas activas.
- **Criterio:** DevTools muestra ≤ 8 draw calls; dominant context sin pérdidas.
- **Estimado:** ~6 h.

**Paso 10.2.2 — Cero fugas VRAM (dispose)**

- [ ] Auditoría de dispose de geometrías/materiales/texturas al re-filtrar y cambiar capas.
- **Criterio:** memoria GPU estable tras 10 min de interacción.
- **Estimado:** ~4.5 h.

**Paso 10.3 — Presupuesto de datos y bundle**

**Paso 10.3.1 — Bundle ≤ 450 KB gzip**

- [ ] Code-splitting por capa (lazy load de módulos); revisar tamaño final.
- **Criterio:** bundle principal y chunks dentro del presupuesto.
- **Estimado:** ~4.5 h.

**Paso 10.3.2 — Moratorium de datos**

- [ ] Límite de datos en memoria (puntos activos máx. por capa) con doc del límite.
- **Criterio:** los límites por capa están documentados y aplicados.
- **Estimado:** ~3 h.

**Paso 10.4 — Optimización de workers**

**Paso 10.4.1 — Throttling de worker (cuando idle)**

- [ ] El worker baja la frecuencia cuando no hay cambios.
- **Criterio:** la CPU del worker baja en reposo.
- **Estimado:** ~2.25 h.

**Paso 10.5 — Verificación E2E de rendimiento (RNF-01, RNF-02, RNF-04)**

**Paso 10.5.1 — Prueba ≥ 60 FPS p95 ≤ 18 ms con >20k datos**

- [ ] Benchmark final con las 5 capas y >20k instancias.
- **Criterio:** p95 ≤ 18 ms; sin caídas en VRAM.
- **Estimado:** ~6 h.

**Paso 10.5.2 — Documentar límites reales**

- [ ] Actualizar doc de rendimiento con límites medidos.
- **Criterio:** los límites documentados coinciden con medidas.
- **Estimado:** ~2.25 h.

**Paso 10.5.3 — Commit del hito `feat/fase-10`**

- [ ] Commit con RNF-01, RNF-02, RNF-04.
- **Criterio:** CI pasa; métricas registradas.
- **Estimado:** ~1.5 h.

**Paso 10.6 — Perfiles finales**

**Paso 10.6.1 — Perfil con las 5 capas**

- [ ] Benchmark con todas las capas activas y >20k puntos.
- **Criterio:** p95 ≤ 18 ms; ≤ 8 draw calls.
- **Estimado:** ~3 h.

**Paso 10.6.2 — Medición de p95**

- [ ] Registrar p95 de frame con las 5 capas.
- **Criterio:** p95 medido y registrado.
- **Estimado:** ~2.25 h.

**Paso 10.6.3 — Comparativa antes/después**

- [ ] Comparar métricas pre/post optimización.
- **Criterio:** mejora documentada.
- **Estimado:** ~2.25 h.

**Paso 10.6.4 — Documentar presupuesto alcanzado**

- [ ] Actualizar docs con los límites reales.
- **Criterio:** docs coherentes con medidas.
- **Estimado:** ~1.5 h.

**Paso 10.6.5 — Actualizar doc de rendimiento**

- [ ] Versión final de GAIA_PERFORMANCE (o SPEC).
- **Criterio:** documentado y consistente.
- **Estimado:** ~1.5 h.

## 13. FASE 11 — Testing Integral, Compatibilidad y CI/CD

> **Objetivo:** Cerrar el lazo de calidad: Lighthouse (RNF-06), navegadores (RNF-07), cobertura y pipeline completo. Los tests por módulo ya se ejecutan en cada fase; aquí se consolida la matriz transversal.

> **Duración:** 6 jornadas (~36 h). **Depende de:** Fases 0–10. **RNF:** RNF-06, RNF-07.

> **Ruta de ejecución:** 5 grupos · 14 micro-pasos.

### Pasos

**Paso 11.1 — Cobertura y contrato**

**Paso 11.1.1 — Umbrales de cobertura**

- [ ] Configurar umbrales (cobertura ≥ 70 % en backend, ≥ 60 % crítico) con pytest-cov (frontend con vitest).
- **Criterio:** `pytest --cov` y `npm test` muestran cobertura y fallan si baja del umbral.
- **Estimado:** ~2.75 h.

**Paso 11.1.2 — Tests de contrato de módulo**

- [ ] Test por módulo que verifique que cumple `DataModule`.
- **Criterio:** todos los módulos pasan el test de contrato.
- **Estimado:** ~3.5 h.

**Paso 11.2 — Lighthouse y navegadores**

**Paso 11.2.1 — Lighthouse (RNF-06)**

- [ ] Integrar Lighthouse CI (performance, accesibilidad, SEO) en el pipeline.
- **Criterio:** presupuesto definido; FCP < 2 s en presupuesto.
- **Estimado:** ~2.75 h.

**Paso 11.2.2 — Compatibilidad de navegadores (RNF-07)**

- [ ] Matriz de navegadores (Chrome/Firefox/Safari/Edge y WebGL2) con smoke test.
- **Criterio:** la app funciona en los navegadores objetivo.
- **Estimado:** ~3.5 h.

**Paso 11.3 — CI/CD**

**Paso 11.3.1 — Pipeline completo**

- [ ] Workflow CI: lint + test + build + lighthouse, y CD a staging.
- **Criterio:** push a `main` despliega a staging; PR pasa checks.
- **Estimado:** ~4.25 h.

**Paso 11.3.2 — E2E con Playwright (transversal)**

- [ ] Smoke E2E de las 5 capas (cargar, toggle, click, scrubber).
- **Criterio:** los flujos E2E pasan en CI.
- **Estimado:** ~4.25 h.

**Paso 11.4 — Verificación E2E de calidad**

**Paso 11.4.1 — Corrección de fallos**

- [ ] Ejecutar suite completa y corregir regresiones.
- **Criterio:** suite verde completa.
- **Estimado:** ~2.75 h.

**Paso 11.4.2 — Commit del hito `feat/fase-11`**

- [ ] Commit con RNF-06, RNF-07.
- **Criterio:** CI pasa; informe de calidad completo.
- **Estimado:** ~1.5 h.

**Paso 11.5 — Cierres de calidad**

**Paso 11.5.1 — Cobertura real total**

- [ ] Verificar cobertura global ≥ umbrales (backend 70/crítico 60).
- **Criterio:** la suite total pasa el umbral.
- **Estimado:** ~2 h.

**Paso 11.5.2 — Lighthouse en staging**

- [ ] Ejecutar Lighthouse sobre staging.
- **Criterio:** presupuesto (FCP < 2 s) en verde.
- **Estimado:** ~2 h.

**Paso 11.5.3 — Matriz de navegadores actualizada**

- [ ] Actualizar matriz con resultados reales.
- **Criterio:** matriz refleja los navegadores probados.
- **Estimado:** ~1.5 h.

**Paso 11.5.4 — E2E en CI con artefactos**

- [ ] Artefactos de Playwright (traces/screenshots) en CI.
- **Criterio:** los artefactos se suben y consultan.
- **Estimado:** ~2 h.

**Paso 11.5.5 — Documentar matrices de testing**

- [ ] Doc de cobertura y matrices consolidado.
- **Criterio:** doc completo y accesible.
- **Estimado:** ~1.5 h.

**Paso 11.5.6 — Actualizar roadmap de la fase**

- [ ] Cerrar la Matriz de Trazabilidad de F11.
- **Criterio:** estado reflejado en el ROADMAP.
- **Estimado:** ~1.5 h.

## 14. FASE 12 — Despliegue, Monitoreo y Operaciones

> **Objetivo:** Publicar GAIA en producción con monitoreo, backups y alertas según [GAIA_DEPLOYMENT](./GAIA_DEPLOYMENT.md).

> **Duración:** 5 jornadas (~30 h). **Depende de:** Fase 11. **RNF/RF:** operaciones.

> **Ruta de ejecución:** 5 grupos · 14 micro-pasos.

### Pasos

**Paso 12.1 — Producción**

**Paso 12.1.1 — Opción A (PaaS)**

- [ ] **Opción A (PaaS)**: frontend en Vercel/Netlify (`npm run build`), backend en Railway/Fly.io, Redis gestionado, DB en servicio (Supabase/Neon).
- **Criterio:** la app corre en producción con TLS, DNS y variables de entorno.
- **Estimado:** ~4.25 h.

**Paso 12.1.2 — Opción B (IaaS + Docker)**

- [ ] **Opción B**: `Dockerfile`s + `docker-compose` (app + redis + db) en VPS, nginx con TLS.
- **Criterio:** la app corre en un VPS con TLS y persistencia en volumen.
- **Estimado:** ~5.25 h.

**Paso 12.1.3 — Variables y secrets**

- [ ] Configurar secrets (API keys) en el gestor del proveedor, sin exponerlos en repo.
- **Criterio:** las keys no están en el código ni en git.
- **Estimado:** ~1 h.

**Paso 12.2 — Monitoreo**

**Paso 12.2.1 — Métricas de aplicación**

- [ ] Métricas básicas (uptime, rate-limit activaciones, fallos) y dashboard simple.
- **Criterio:** se visualizan las métricas en un dashboard.
- **Estimado:** ~2.75 h.

**Paso 12.2.2 — Logs centralizados**

- [ ] Agregación de logs (JSON estructurado) con retención y búsqueda.
- **Criterio:** los logs se buscan y filtran por nivel/servicio.
- **Estimado:** ~2.25 h.

**Paso 12.3 — Backups y alertas**

**Paso 12.3.1 — Backups de base de datos**

- [ ] Backup diario (DB + Redis dump) con retención y prueba de restauración.
- **Criterio:** restore probado de la última copia.
- **Estimado:** ~2.25 h.

**Paso 12.3.2 — Alertas de salud**

- [ ] Alertas de caída y degradación (ping, rate-limit alto, 5xx).
- **Criterio:** una alerta llega ante fallo simulado.
- **Estimado:** ~2.25 h.

**Paso 12.4 — Verificación E2E de despliegue**

**Paso 12.4.1 — Prueba de restauración y rollback**

- [ ] Simular restore y rollback de versión.
- **Criterio:** restore funciona; rollback a versión previa funciona.
- **Estimado:** ~2.25 h.

**Paso 12.4.2 — Commit del hito `feat/fase-12`**

- [ ] Commit con documentación de despliegue en [GAIA_DEPLOYMENT](./GAIA_DEPLOYMENT.md).
- **Criterio:** la doc de despliegue refleja la pila real.
- **Estimado:** ~1 h.

**Paso 12.5 — Operaciones**

**Paso 12.5.1 — Runbook de operaciones**

- [ ] Documentar procedimientos (deploy, restore, rollback, alertas).
- **Criterio:** cualquier operador sigue el runbook.
- **Estimado:** ~1.5 h.

**Paso 12.5.2 — Test de alerta real**

- [ ] Disparar una alerta de salud de verdad.
- **Criterio:** la alerta llega al canal configurado.
- **Estimado:** ~1 h.

**Paso 12.5.3 — Monitoreo de rate-limit en prod**

- [ ] Ver metric de activaciones de rate-limit en prod.
- **Criterio:** métrica visible y alertable.
- **Estimado:** ~1.5 h.

**Paso 12.5.4 — Backup manual verificado**

- [ ] Restore verificada desde la última copia.
- **Criterio:** restore funciona end-to-end.
- **Estimado:** ~1.5 h.

**Paso 12.5.5 — Documentación final de despliegue**

- [ ] Actualizar GAIA_DEPLOYMENT con la pila final.
- **Criterio:** la doc refleja producción real.
- **Estimado:** ~1 h.

## 15. FASE 13 — Pulido Final, Docs y Demostración

> **Objetivo:** Cierre del proyecto: README pulido, video/demo, licencia y documento de arquitectura final.

> **Duración:** 3 jornadas (~18 h). **Depende de:** Fase 12.

> **Ruta de ejecución:** 4 grupos · 9 micro-pasos.

### Pasos

**Paso 13.1 — README y showcase**

**Paso 13.1.1 — README pulido**

- [ ] README con screenshot, instrucciones, badges (CI, cobertura), arquitectura y enlaces a todos los docs.
- **Criterio:** cualquier dev puede poner GAIA en marcha siguiendo el README.
- **Estimado:** ~3 h.

**Paso 13.1.2 — Modo presentación**

- [ ] Modo demo con vuelo orbital automático y datos cargados.
- **Criterio:** la demo recorre el globo con las capas visibles.
- **Estimado:** ~3 h.

**Paso 13.1.3 — Documentación de la demo**

- [ ] Script de 2 min para el video/demo.
- **Criterio:** demo reproducible siguiendo el script.
- **Estimado:** ~1 h.

**Paso 13.2 — Licencia y cierre**

**Paso 13.2.1 — Licencia y repo público**

- [ ] LICENSE (MIT) y repo público con temas claros (issues sin resolver documentados).
- **Criterio:** repo público con licencia y README limpio.
- **Estimado:** ~1 h.

**Paso 13.2.2 — Estado final en README**

- [ ] Actualizar README con el estado final del proyecto.
- **Criterio:** README refleja el cierre del roadmap.
- **Estimado:** ~0.5 h.

**Paso 13.3 — Documento de arquitectura final**

**Paso 13.3.1 — Architecture doc final**

- [ ] Documento final de arquitectura (diagramas, decisiones, límites medidos).
- **Criterio:** el doc final refleja lo construido.
- **Estimado:** ~4 h.

**Paso 13.3.2 — Cierre del roadmap**

- [ ] Marcar todas las fases como hechas (Matriz de Trazabilidad completa) y actualizar README.
- **Criterio:** no queda ninguna fase pendiente.
- **Estimado:** ~1 h.

**Paso 13.4 — Verificación final**

**Paso 13.4.1 — Demo final y revisión de portfolio**

- [ ] Grabación de video/demo y revisión final de la presentación.
- **Criterio:** demo presentable en 2 min.
- **Estimado:** ~3 h.

**Paso 13.4.2 — Revisión final de coherencia de docs**

- [ ] Revisar que todos los docs estén alineados y sin enlaces rotos.
- **Criterio:** docs coherentes y completos.
- **Estimado:** ~1 h.

## 16. Matriz de Trazabilidad Fase ↔ RF/RNF

| Fase | RF / RNF cubiertos                       | Estado                         |
| ---- | ---------------------------------------- | ------------------------------ |
| F0   | RNF-01 (baseline), RNF-07 (base headers) | En curso — 0.1 a 0.5 validados |
| F1   | RF-01, RF-02, RNF-06, RNF-07 (globo)     | Pendiente                      |
| F2   | RF-03, RF-04, RNF-02, RNF-03, RNF-05     | Pendiente                      |
| F3   | RF-07, RF-08, RNF-02, RNF-03             | Pendiente                      |
| F4   | RF-05, RF-06, RNF-01, RNF-03             | Pendiente                      |
| F5   | RF-09, RF-10, RNF-01                     | Pendiente                      |
| F6   | RF-13, RF-14, RNF-02, RNF-03, RNF-04     | Pendiente                      |
| F7   | RF-11, RF-12, RNF-04                     | Pendiente                      |
| F8   | RNF-03, RNF-05                           | Pendiente                      |
| F9   | RNF-07 (parcial), GDPR/privacidad        | Pendiente                      |
| F10  | RNF-01, RNF-02, RNF-04                   | Pendiente                      |
| F11  | RNF-06, RNF-07                           | Pendiente                      |
| F12  | operaciones, despliegue                  | Pendiente                      |
| F13  | cierre y demostración                    | Pendiente                      |

F0 se marca como **cubierta** al cerrar su último grupo, el 0.8 (Paso 0.8.15 —
Actualizar Matriz de Trazabilidad); hasta entonces la columna refleja el estado
real: los grupos 0.6 (testing), 0.7 (benchmark) y 0.8 (documentación) siguen
pendientes.

Los valores técnicos y la definición de RF/RNF viven en [GAIA_SPECIFICATION.md](./GAIA_SPECIFICATION.md).

## 17. Requisitos Transversales: Puntos de Control Numéricos

Estos son los **controles numéricos** que se verifican en cada fase y se consolidan al final (F11-F12):

| Control                               | Valor                                                         | Referencia        |
| ------------------------------------- | ------------------------------------------------------------- | ----------------- |
| TTL de datos (fires/quakes/radiation) | 300 s                                                         | SPEC §TTL         |
| TTL de rejilla de viento              | 900 s                                                         | SPEC §TTL         |
| TTL de elevación                      | 300 s                                                         | SPEC §TTL         |
| TTL de sesión                         | 30 días                                                       | SPEC §Sesión      |
| Retención de datos crudos (fires/rad) | 90 días                                                       | SPEC §Retención   |
| Retención de sismos                   | 365 días                                                      | SPEC §Retención   |
| Retención de wind grid                | 90 días                                                       | SPEC §Retención   |
| Retención de log de API               | 90 días                                                       | SPEC §Retención   |
| Retención de sesiones anónimas        | 30 días                                                       | SPEC §Retención   |
| Rate-limit global                     | 120 r/m (burst 240)                                           | SPEC §Rate Limit  |
| Rate-limit por módulo                 | 60 fires / 60 quakes / 30 wind / 30 radiation / 120 elevation | SPEC §Rate Limit  |
| Draw calls máximos                    | 8                                                             | SPEC §Rendimiento |
| FPS objetivo                          | 60 (p95 ≤ 18 ms)                                              | SPEC §Rendimiento |
| FCP                                   | < 2 s                                                         | SPEC §Rendimiento |
| Bundle (gzip)                         | ≤ 450 KB                                                      | SPEC §Rendimiento |
| Cookie de sesión                      | sha256, sin PII                                               | SPEC §Privacidad  |

## 18. Riesgos Principales y Mitigaciones

| Riesgo                                | Mitigación                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| API externa caída o con rate limit    | Caché Redis → fallback local del módulo y modo resguardo (F8)                            |
| Datos malformados de fuentes          | Parser por fuente con fixture y tests de contrato (F11)                                  |
| Rendimiento con >20k puntos           | LOD, instancing, bisútil, presupuesto por capa (F10)                                     |
| Fuga de memoria GPU                   | Auditoría de dispose + benchmark de VRAM (F10, F7)                                       |
| Scope creep                           | El roadmap define el alcance total; los grupos opcionales quedan fuera de los 14 RF base |
| SES de sesión/cookie mal configuradas | Checklist de seguridad dedicado (F9)                                                     |

## 19. Mejoras Opcionales (Documentadas en Otros Docs, Fuera de los 14 RF)

Estas mejoras **no bloquean** el flujo base y están documentadas en sus documentos de origen:

- Fase 1.7 — Batimetría GEBCO (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 1.8 — Constelaciones y límites (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 2.7 — VMAP0 de Perú y Chile (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 3.7 — Umbral de leventes
- Fase 3.8 — EMSC (segunda fuente de sismos, Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 4.3 — Celosías de alta resolución (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 4.8 — Filtro de densidad y colores
- Fase 5.6 — Datos vectoriales de ciudades costeras (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))
- Fase 7.6 — Heatmap radiológico (Ver [GAIA_SPECIFICATION](./GAIA_SPECIFICATION.md))

## 20. Recomendación de Secuencia de Trabajo (por jornada corta)

1. **Fase 0 (10 jornadas):** base de plataforma. Nada de módulos antes de esto.
2. **Fase 1 (10 jornadas):** globo 3D. Es la pieza visual sobre la que se monta todo.
3. **Fases 2-6 (8+8+9+6+7 jornadas):** los 5 módulos end-to-end en orden de dificultad creciente (fires → quakes → wind → sea → rad). Es el patrón que se repite.
4. **Fase 7 (6 jornadas):** interacción transversal (time-scrubber, toggles, feed, clic).
5. **Fase 8 (4 jornadas):** resiliencia E2E.
6. **Fase 9 (4 jornadas):** seguridad/hardening.
7. **Fase 10 (8 jornadas):** optimización de rendimiento.
8. **Fase 11 (6 jornadas):** testing y CI/CD.
9. **Fase 12 (5 jornadas):** despliegue.
10. **Fase 13 (3 jornadas):** cierre y demo.

> Total ≈ **94 jornadas** (~564 h de foco a ~6 h/jornada).

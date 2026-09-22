# AGENTS.md — GAIA

## Reglas de oro del proyecto
- **Todos los docs de `docs/` son la ÚNICA fuente de verdad** del proyecto. Ninguna afirmación, convención o valor debe inventarse ni asumirse fuera de lo que dictan.
- **Ante cualquier duda o contradicción** entre documentos — por mínima que sea — **preguntar al usuario antes de actuar** (usar la tool de preguntas). No resolver ambigüedades por cuenta propia.
- **Prohibido modificar documentación sin permiso explícito.** No editar, crear, renombrar ni eliminar ningún doc de `docs/` (ni sus versiones/fechas) salvo que el usuario lo autorice.

## Estado del repo
- Solo documentación (15 docs en `docs/`, cada uno con `version` + `fecha` en cabecera). **No existe** `frontend/` ni `backend/`: no hay package.json, tests, lint ni CI. No inventar comandos de build/test (no existen).
- Todo el contenido es **en español** (identificadores, rutas y comandos en inglés). Escribir nueva documentación en español.

## Regla de oro: coherencia entre documentos
Todos los docs de `docs/` comparten valores canónicos en paralelo. Al editar cualquier doc, rastrear y alinear los demás (verificar con grep tras editar). Fuentes de verdad:

- **Contrato API**: `{ success, data, error }` — NUNCA `{ ok, error }`. Canónico en `GAIA_API_CONTRACT.md`.
- **Códigos de error**: los 7 de `GAIA_API_CONTRACT.md` (`VALIDATION_ERROR`, `NOT_FOUND`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_TIMEOUT`, `CACHE_MISS`, `INTERNAL_SERVER_ERROR`). No están en `GAIA_SPECIFICATION.md`.
- **Stack (fijo, no re-negociable al documentar)**: Vite (no Webpack), FastAPI/Python (no backend Node), `redis>=5` con `redis.asyncio` (no aioredis/ioredis), SQLAlchemy + Alembic, Valtio, Workers + Comlink.
- **Endpoints**: `/api/fires`, `/api/earthquakes` (no `/api/quakes`), `/api/wind`, `/api/radiation`, `/api/history/*`, `/api/health`.
- **Env vars de frontend**: prefijo `VITE_GAIA_*` (Vite solo expone `VITE_*`).
- **Valores canónicos (ROADMAP §17)**: TTL 300/900/300 s, retención 90/365/90 d, rate-limit global 120 r/m (burst 240), por módulo 60/60/30/30/120, ≤8 draw calls, 60 FPS p95 ≤18 ms, FCP <2 s, bundle ≤450 KB gzip, cookie `gaia_session` (30 d, sha256, sin PII).
- Al editar un doc: subir su `version` y `fecha` (cada doc declara la suya en cabecera — hoy van de 1.0 a 1.4 —; no asumir una versión global ni usar fechas falsas).

## Convenciones del proyecto (verificadas en los docs)
- **No duplicar valores técnicos.** Las tablas canónicas (TTL, rate limits, retención, draw calls) viven en su doc de origen: referenciarlas y citar el RF/RNF aplicable en vez de repetirlas (patrón del ROADMAP §1.1, presente en WORKFLOWS y DATA_SOURCES).
- **`quakes` interno ≠ endpoint público.** Pueden existir `quakes.service.ts`, `quakes.py` o `quakes_latest.json`; el endpoint público es SIEMPRE `/api/earthquakes`. No "corregir" los nombres internos.
- **Radiación en `µSv/h` siempre**; CPM se normaliza en el backend (SPEC, Subsistema 7). No menear ninguna otra unidad en docencia de radiación.
- **URLs de fuentes externas solo desde `GAIA_DATA_SOURCES.md`**; nunca inventar URLs o endpoints de fuentes de datos.
- **Estética UI según `GAIA_VISUAL_DESIGN.md`**: sobria, mínima, orbital. No describir la interfaz como "dashboard denso", "hiperfuncional" ni "estética militar".
- **Nuevos docs**: cabecera con `version`+`fecha`, fila añadida en el README y enlaces cruzados desde docs afines (patrón de `GAIA_VISUAL_DESIGN.md`).

## Roadmap (`GAIA_ROADMAP.md`)
- Números verificables que deben cuadrar en TODA mención: 14 fases · 97 grupos · **332 micro-pasos · 564.5 h ≈ 94 jornadas** (jornada = 6 h). Las horas de cada fase deben cuadrar con (jornadas de la fase × 6) ±1.2 h.
- Estado real: **planificado, NO ejecutado** (no hay código). No afirmar que fases están "aprobadas y ejecutadas" (deuda conocida: el ROADMAP decía "Aprobado y ejecutado").
- Recomendaciones accionables priorizadas en `GAIA_RECOMENDACIONES.md` (P0–P3); P0 = arrancar Fase 0 (Vite scaffold + health FastAPI + Redis PING + migration Alembic + contrato).

## Git
- Mensajes de commit estilo `docs: ...` (historial existente lo usa).
- `opencode.json` y `.env` están **gitignored** (`opencode.json` contiene la API key de Context7). No committear ni editar el `opencode.json` para romper el plugin ponytail o el MCP de context7; **sí** commitear `.env.example`.
- Tras commit suele pushearse a `origin/main`.

## Verificación (no hay framework)
- No hay lint/typecheck/test. Validar cambios con greps de coherencia:
  - Contrato, endpoints, stack y nombres propios (ver arriba).
  - `/api/quakes` → 0 resultados; `quakes.*` interno (archivos/carpetas) es legítimo: no marcarlo como error.
  - `webpack` solo como comparación intencional (TECH_STACK/DEPLOYMENT).
  - "denso" solo como contexto de dataset (ROADMAP) o anti-patrón (VISUAL_DESIGN).
  - En `GAIA_ROADMAP.md`: recontar micro-pasos (332), horas (564.5), grupos (97) y rutas por fase (14/14 OK).
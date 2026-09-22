# AGENTS.md — GAIA

## Estado del repo
- Solo documentación (14 docs en `docs/`, cada uno con `version` + `fecha` en cabecera). **No existe** `frontend/` ni `backend/`: no hay package.json, tests, lint ni CI. No inventar comandos de build/test (no existen).
- Todo el contenido es **en español** (identificadores, rutas y comandos en inglés). Escribir nueva documentación en español.

## Regla de oro: coherencia entre documentos
Los 14 docs comparten valores canónicos en paralelo. Al editar cualquier doc, rastrear y alinear los demás (verificar con grep tras editar). Fuentes de verdad:

- **Contrato API**: `{ success, data, error }` — NUNCA `{ ok, error }`. Canónico en `GAIA_API_CONTRACT.md`.
- **Códigos de error**: los 7 de `GAIA_API_CONTRACT.md` (`VALIDATION_ERROR`, `NOT_FOUND`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_RATE_LIMITED`, `UPSTREAM_TIMEOUT`, `CACHE_MISS`, `INTERNAL_SERVER_ERROR`). No están en `GAIA_SPECIFICATION.md`.
- **Stack (fijo, no re-negociable al documentar)**: Vite (no Webpack), FastAPI/Python (no backend Node), `redis>=5` con `redis.asyncio` (no aioredis/ioredis), SQLAlchemy + Alembic, Valtio, Workers + Comlink.
- **Endpoints**: `/api/fires`, `/api/earthquakes` (no `/api/quakes`), `/api/wind`, `/api/radiation`, `/api/history/*`, `/api/health`.
- **Env vars de frontend**: prefijo `VITE_GAIA_*` (Vite solo expone `VITE_*`).
- **Valores canónicos §17 de SPEC**: TTL 300/900/300 s, retención 90/365/90 d, rate-limit global 120 r/m (burst 240), por módulo 60/60/30/30/120, ≤8 draw calls, 60 FPS p95 ≤18 ms, FCP <2 s, bundle ≤450 KB gzip, cookie `gaia_session` (30 d, sha256, sin PII).
- Al editar un doc: subir su `version` y `fecha` (los ya uni xados son 1.1/2026-09-22; no usar fechas falsas).

## Roadmap (`GAIA_ROADMAP.md`)
- Números verifi vcables que deben cuadrar en TODA mención: 14 fases · 97 grupos · **332 micro-pasos · 564.5 h ≈ 94 jornadas** (jornada = 6 h). Horas por fase ≈ ene±1.2 h de fases×6.
- Estado real: **planificado, NO ejecutado** (no hay código). No afirmar que fases están "aprobadas y ejecutadas" (deuda conocida: el ROADMAP decía "Aprobado y ejecutado").
- Recomendaciones accionables priorizadas en `GAIA_RECOMENDACIONES.md` (P0–P3); P0 = arrancar Fase 0 (Vite scaffold + health FastAPI + Redis PING + migration Alembic + contrato).

## Git
- Mensajes de commit estilo `docs: ...` (historial existente lo usa).
- `opencode.json` y `.env` están **gitignored** (`opencode.json` contiene la API key de Context7). No committear ni editar el `opencode.json` para romper el plugin ponytail o el MCP de context7; **sí** commitear `.env.example`.
- Tras commit suele pushearse a `origin/main`.

## Verificación (no hay framework)
- No hay lint/typecheck/test. Validar cambios con greps de coherencia: contrato, endpoints, stack y nombres propios (ver arriba); en `GAIA_ROADMAP.md` recontar micro-pasos (332), horas (564.5), grupos (97) y rutas por fase (14/14 OK).
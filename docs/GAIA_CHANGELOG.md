# GAIA — Changelog y política de versionado

> **Proyecto:** GAIA 3D
> **Versión del Documento:** 1.0
> **Fecha:** 2026-09-28
> **Alcance:** Cómo se versiona GAIA y qué se anota en cada release. El detalle de lo entregado paso a paso está en el [ROADMAP](./GAIA_ROADMAP.md) y el estado de trabajo en la [DoD](./GAIA_DOD.md).

---

## Contenido

1. [Formato](#1-formato)
2. [Política de versión](#2-política-de-versión)
3. [Historial](#3-historial)
4. [Etiquetado](#4-etiquetado)

---

## 1. Formato

[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) sobre [SemVer](https://semver.org/lang/es/):
una sección por versión, y dentro de ella las entradas en los grupos `Añadido`,
`Cambiado`, `Deprecado`, `Eliminado`, `Corregido` y `Seguridad`. Las entradas se
escriben para alguien que lee el changelog sin contexto: qué cambió, no qué commit
lo cambió.

Reglas de la casa:

- **Cada fase del ROADMAP añade su sección**, no cada commit. El detalle de los
  micro-pasos va en el ROADMAP; aquí va la entrega.
- **Lo que no está en `Unreleased` está en el tag.** Una entrada sin tag es trabajo en
  curso y se puede rehacer.
- **Un cambio que rompe el contrato de la API se dice explícitamente** en `Cambiado`,
  aunque antes de 1.0 no bumpemos la versión mayor.
- Los datos con fecha van en RFC 3339, como el `acq_date` de
  [TECH_STACK](./GAIA_TECH_STACK.md).

## 2. Política de versión

SemVer estricto (`MAJOR.MINOR.PATCH`), con estas decisiones encima:

| Decisión                                     | Por qué                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Precedente 1.0 mientras tanto**            | El API y el store se van a mover; en 0.x un cambio incompatible es legítimo y no obliga a MAJOR.                |
| **La versión la comparten los cinco sitios** | Que no se desmarmen es parte del contrato: si el backend dice 0.2.0 y el frontend 0.1.0, la API no sabe qué es. |
| **Se sube al cerrar una fase**               | No por commit. F0.publishable es el primer tag, no el día que se arregla un typo.                               |
| **PATCH sin tag para el trabajo diario**     | La routine no genera ruido de releases.                                                                         |

Los cinco sitios, y hoy los cuatro no coinciden:

| Sitio                    | Paquete     | Versión |
| ------------------------ | ----------- | ------- |
| `package.json` (raíz)    | `gaia`      | 0.1.0   |
| `frontend/package.json`  | frontend    | 0.1.0   |
| `shared/package.json`    | shared      | 0.1.0   |
| `backend/pyproject.toml` | backend     | 0.1.0   |
| `backend/app/main.py`    | app FastAPI | 0.1.0   |

`frontend/package.json` iba en 0.0.0, un resto del scaffold de Vite; se alineó al hacer
este doc.

## 3. Historial

El formato es el de Keep a Changelog. Sin enlaces de comparación todavía: se añaden
con el primer tag, cuando hay contra qué comparar.

## [Unreleased] — Fase 0: fundación de la plataforma

45 de los 66 micro-pasos de F0 realizados. Lo que queda está en el ROADMAP.

### Añadido

- **Monorepo** npm con `frontend/`, `shared/` y `backend/`; ESLint, Prettier, husky y
  lint-staged; CI en GitHub Actions.
- **Contrato universal** `{ success, data, error }` con los siete códigos de error, en
  `shared/` y con su cliente HTTP tipado (timeout, reintentos, sin parsear el cuerpo a
  mano).
- **API FastAPI**: `GET /api/health`, cliente Redis asíncrono reutilizable, rate limit
  global con token bucket, sesión por cookie `gaia_session` con sha256 y sin PII,
  cabeceras de seguridad y CORS.
- **Persistencia**: Alembic y SQLAlchemy 2 con las tablas `session`, `data_source`,
  `raw_payload` y `api_log`, más el log de API con su retención.
- **Store Valtio** con `loading`/`error`/`lastUpdated` y acciones tipadas.
- **Plantilla de Web Worker** con protocolo `postMessage` tipado, Comlink y
  Transferables, lista para los workers W1-W3 de la capa de cómputo.
- **DevOverlay** con FPS, p95, draw calls y detección de frames largos.
- **Testing**: 73 tests de backend, 63 de frontend, 15 de los scripts de la raíz, 5 E2E
  con Playwright y cobertura publicada por fase con puerta donde un doc fija el número.
- **Rendimiento**: medición del bundle gzip, presupuestos de assets, línea base
  versionada en `docs/performance/baseline.json` con comparador automático, y FCP medido
  con Lighthouse.
- **Documentación**: guía de contribución, documento de arquitectura de F0-F1, estas
  plantillas de issue y PR, budgets de rendimiento y la sección de puesta en marcha del
  README.

### Corregido

- El job de CI del frontend corría en `frontend/` con `working-directory`, donde tres
  de sus scripts no existen; ahora corre en la raíz.
- `npm test` y `npm run perf:check` no existían en la raíz y el CI los pedía.
- La cifra de CSS del baseline era 1,47 KiB cuando son 1,44, lo que producía un
  `-4,8 %` fantasma; y la medición no incluía el CSS.
- El rate limit devolvía 500 con Redis caído en vez de degradar en fail-open.

### Seguridad

- Cabeceras de seguridad y CSP base, CORS con allowlist, cookie de sesión sin PII y
  rate limit global.

## 4. Etiquetado

El tag se pone al cerrar una fase, con anotación para que `git show` lea el porqué:

```bash
git tag -a v0.1.0 -m "Fase 0: fundación de la plataforma" <commit>
git push origin v0.1.0
```

Con el primer tag se completa el pie de este doc con los enlaces de comparación que
manda Keep a Changelog, y a partir de ahí cada versión va con su tag y su sección.

Los commits ya llevan prefijo semántico con el paso como scope (`feat(0.7.12):`,
`fix(ci):`, `docs:`), así que el changelog se puede escribir a mano sin depender de
ninguna herramienta. La convención está en la
[guía de contribución](./GAIA_CONTRIBUTING.md) §4.

---

_Este documento complementa al [ROADMAP](./GAIA_ROADMAP.md) (fases) y a la
[Definición de Terminado](./GAIA_DOD.md) (estado de cada micro-paso) del proyecto GAIA._

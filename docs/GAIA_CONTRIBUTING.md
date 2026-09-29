# GAIA — Guía de contribución

> **Proyecto:** GAIA 3D
> **Versión del Documento:** 1.1
> **Fecha:** 2026-09-28
> **Alcance:** Cómo se trabaja en este repositorio: el bucle de un micro-paso, los comandos que existen y las reglas de los docs. El _qué_ se instala está en el [README](../README.md) y el _checklist_ de calidad en la [DoD](./GAIA_DOD.md); aquí no se repite ninguno de los dos.

---

## Contenido

1. [Antes de tocar nada](#1-antes-de-tocar-nada)
2. [Puesta en marcha](#2-puesta-en-marcha)
3. [El bucle de un micro-paso](#3-el-bucle-de-un-micro-paso)
4. [Ramas y commits](#4-ramas-y-commits)
5. [El hook de pre-commit](#5-el-hook-de-pre-commit)
6. [Comandos](#6-comandos)
7. [Reglas de los documentos](#7-reglas-de-los-documentos)
8. [Antes de pedir revisión](#8-antes-de-pedir-revisión)

---

## 1. Antes de tocar nada

Los documentos de `docs/` son la fuente de verdad del proyecto. Si un valor, un
endpoint o una convención no está escrito ahí, no se inventa: se busca el doc que lo
fija y se aplica citando el apartado. Si ningún doc lo fija, se pregunta.

Los tres que hay que tener abiertos antes de cambiar código:

| Doc                                      | Para qué                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| [SPECIFICATION](./GAIA_SPECIFICATION.md) | Requisitos funcionales y no funcionales, capas y subsistemas |
| [ROADMAP](./GAIA_ROADMAP.md)             | Qué paso toca, su criterio de aceptación y su estimado       |
| [ARCHITECTURE](./GAIA_ARCHITECTURE.md)   | Qué está montado de verdad y qué es solo plantilla           |

Un cambio de código que contradiga un doc no arregla el código: primero se discute.

## 2. Puesta en marcha

Cuatro comandos, en este orden. Los requisitos y el bloque completo, con sus
versiones, están en el [README](../README.md) § Puesta en marcha.

```bash
npm ci                      # frontend + shared + tooling (espacio de trabajo de npm)
cd backend && uv sync       # API y sus tests; el grupo dev se instala por defecto
cp .env.example backend/.env
cd .. && npm run dev        # Vite en el 5173; la API va aparte, en el 8000
```

`uv sync` instala también el grupo `dev` (pytest, httpx2, fakeredis): no hace falta
ningún `--extra`. Para la API, en otra terminal: `cd backend && uv run uvicorn
app.main:app --reload --port 8000`.

Lo que **no** hace falta para trabajar: PostgreSQL y Redis. Sin ellos, `/api/health`
responde igual y los dos degradan solos (`SECURITY` §4.2, fail-open de 0.6.8); lo
único que se cae son las migraciones y la persistencia.

## 3. El bucle de un micro-paso

El proyecto avanza de uno en uno. Un paso pasa por cuatro estados y no se salta ninguno:

```
pending  ->  in_progress  ->  completed (realizado)  ->  validated (validado)
```

1. **Se marca `in_progress`** antes de escribir código, y solo uno a la vez.
2. **Se cumple el criterio** del ROADMAP, con evidencia: la salida del comando, el
   test que falla si el comportamiento se rompe, la mutación que lo ata.
3. **Se marca `completed` y se commitea de inmediato**, antes de pedir la validación.
4. **El usuario valida y entonces se marca `validated`.**

**No se empieza el paso siguiente hasta que el anterior está validado.** El detalle de
qué significa cada estado está en la [DoD](./GAIA_DOD.md) §1-§2.

## 4. Ramas y commits

**Rama:** una por fase, `feat/fase-X` (p. ej. `feat/fase-0`). El número de fase sale de
ahí y es el que va en el scope del commit.

**Mensaje:** `<tipo>(fase-N): <nº de paso> <qué cambia y por qué>`

```
feat(fase-0): 0.3.1 Alembic + SQLAlchemy con las tablas base del modelo canonico
fix(fase-0): 0.2.1 aplica lo que fijan los docs (typo, getattr defensivo) y regla de docs en AGENTS
docs(fase-0): 0.8.8 convencion de commits con scope de fase y numero de paso en el asunto
```

- **Un commit por paso realizado** (§3): es el historial verificable de avance y el
  respaldo de la validación. Por eso el **número de paso va en el asunto** y no solo en el
  cuerpo — es lo que permite auditar con un `git log` qué pasos están commiteados.
- **El tipo es uno de los que el repo ya usa**: `feat`, `fix`, `docs`, `test`, `chore` y
  `build`. No se inventan tipos nuevos; si ninguno encaja, es `chore` con el motivo en el
  cuerpo.
- **El cuerpo cita el doc que lo manda** (sección, RF o RNF) cuando el cambio aplica una
  regla, y explica el porqué de lo que no se ve a simple vista. El asunto dice _qué_ cambia;
  el cuerpo dice _por qué_ y con _qué criterio_.
- **No se reescribe la historia.** Los commits anteriores a esta convención se quedan como
  están: el criterio del paso 0.8.8 del ROADMAP es que la convención se aplique **desde F1
  en adelante**, y los pasos de F0 que quedan se hacen ya con la forma nueva. Corregir el
  pasado exigiría reescribir ramas ya pusheadas, y un historial reescrito es peor que un
  historial con cinco commits sin prefijo de los primeros días.

## 5. El hook de pre-commit

[Husky](https://typicode.github.io/husky/) corre [`lint-staged`](https://github.com/lint-staged/lint-staged)
sobre lo que haya en el índice: **Prettier** formatea los `.ts`, `.tsx`, `.js`, `.jsx`,
`.css`, `.md` y `.json` tocados. Se activa con `npm ci` (script `prepare`).

Ojo con lo que **no** hace: el hook **no** pasa lint ni tests. Es formato y nada más.
Por eso §6 tiene los comandos que hay que correr a mano antes de pedir revisión; el CI
es el que los ejecuta en cada PR.

## 6. Comandos

Todos estos existen y son los que usa el CI. Los de la raíz son _proxies_ al espacio de
trabajo de `frontend` cuando toca.

| Comando                          | Qué hace                                                           |
| -------------------------------- | ------------------------------------------------------------------ |
| `npm test`                       | Unit de los scripts de la raíz y del frontend                      |
| `npm run test:scripts`           | Solo los tests de `tests/` (Vitest)                                |
| `npm run test:front`             | Solo el unit del frontend                                          |
| `npm run test:e2e -w frontend`   | Smoke E2E; levanta Vite y uvicorn, no necesita Redis ni PostgreSQL |
| `npm run lint`                   | oxlint con `--deny-warnings`                                       |
| `npm run lint:imports`           | ESLint: orden de imports y boundaries de `shared/`                 |
| `npm run typecheck`              | `tsc -b` de `shared`                                               |
| `npm run build`                  | `tsc -b` y build de producción                                     |
| `npm run coverage`               | Cobertura por fase, con los gates de `PERFORMANCE`                 |
| `npm run perf:check`             | Bundle gzip contra el presupuesto                                  |
| `npm run perf:baseline`          | Compara el bundle con `docs/performance/baseline.json`             |
| `cd backend && uv run pytest -q` | Suite del backend con cobertura                                    |

El detalle de cada uno está en la tabla de scripts del [README](../README.md); los
presupuestos que verifican, en [PERFORMANCE](./GAIA_PERFORMANCE.md).

## 7. Reglas de los documentos

- **No se edita un doc sin permiso.** Cada cambio de doc se pide antes.
- Al editar uno, se suben su **versión** y su **fecha** en la cabecera.
- Un doc nuevo lleva cabecera con versión y fecha, fila en la tabla del README y
  enlaces cruzados desde los docs afines.
- Los valores técnicos viven en un solo doc: los canónicos (TTL, rate limits,
  retención, presupuestos) están en su tabla de origen y el resto los cita, no los
  copia. Un número repetido en dos sitios es una contradicción esperando.
- Nada de contrato sin envoltura: la API es siempre `{ success, data, error }`, y
  `error` usa los siete códigos de [API_CONTRACT](./GAIA_API_CONTRACT.md) §3.
- Los endpoints públicos son `/api/fires`, `/api/earthquakes`, `/api/wind`,
  `/api/radiation`, `/api/history/*` y `/api/health`. Dentro del código los módulos de
  sismos se pueden llamar `quakes`, pero el endpoint nunca.
- El nombre del endpoint no se "corrige" en el cliente por simetría con el nombre
  interno.

## 8. Antes de pedir revisión

Checklist corto; el largo, con los comandos y la evidencia que hay que dejar, está en la
[DoD](./GAIA_DOD.md) §2-§3.

- [ ] El criterio del paso en el ROADMAP está cumplido, con evidencia.
- [ ] Hay un test que falla si el comportamiento se rompe (salvo excepción de §5 de la
      DoD: docs, refactors mecánicos y cambios de configuración).
- [ ] La mutación que ata el test está hecha y se ha deshecho.
- [ ] La suite del área tocada en verde, y `prettier` sin cambios pendientes.
- [ ] Sin secretos ni `.env` en el índice.
- [ ] Los docs afectados actualizados con versión y fecha.
- [ ] El paso marcado `completed` y commiteado.

---

_Esta guía complementa al [README](../README.md) (puesta en marcha) y a la
[Definición de Terminado](./GAIA_DOD.md) (checklist de calidad) del proyecto GAIA._

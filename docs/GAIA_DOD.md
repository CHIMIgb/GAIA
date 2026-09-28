# GAIA — Definición de Terminado (DoD)

> **Proyecto:** GAIA 3D  
> **Versión del Documento:** 1.0  
> **Fecha:** 2026-09-27  
> **Alcance:** Fija qué tiene que ser cierto para dar por terminado un micro-paso del [Roadmap](./GAIA_ROADMAP.md). Complementa las reglas de avance paso a paso de [`AGENTS.md`](../AGENTS.md) y los tipos de prueba de [Plan de Testing](./GAIA_TESTING.md).

---

## Contenido

1. [Qué es un paso terminado](#1-qué-es-un-paso-terminado)
2. [Checklist](#2-checklist)
3. [Cómo se verifica cada punto](#3-cómo-se-verifica-cada-punto)
4. [Mutación: cómo se sabe que el test sirve](#4-mutación-cómo-se-sabe-que-el-test-sirve)
5. [Excepciones](#5-excepciones)
6. [Relación con el resto de documentos](#6-relación-con-el-resto-de-documentos)

---

## 1. Qué es un paso terminado

Un micro-paso del ROADMAP está **terminado** cuando se cumplen las tres barras del ROADMAP
(`completed` → `validated`) y, además, el **Criterio** del paso está verificado con evidencia
en la misma revisión. No basta con que el código exista: el criterio es el que manda.

Los estados que usa el ROADMAP son:

| Estado        | Significado                                                      |
| ------------- | ---------------------------------------------------------------- |
| `pending`     | Sin empezar.                                                     |
| `in_progress` | En curso, un solo paso a la vez.                                 |
| `completed`   | Implementado y con criterio verificado; pendiente de validación. |
| `validated`   | Validado por la persona usuaria.                                 |

> Regla del proyecto: **no se avanza al paso siguiente sin que el anterior esté
> `validated`**, y un cambio no ligado a un paso necesita permiso explícito.

## 2. Checklist

- [ ] El **Criterio** del paso está verificado con evidencia (salida de un comando, test en
      verde o measurement), no por inspección del código.
- [ ] Hay al menos un **test** que ata el comportamiento. Si el paso es solo configuración,
      la evidencia es la ejecución del comando que la aplica.
- [ ] El test **falla si el comportamiento se rompe** (ver [§4](#4-mutación-cómo-se-sabe-que-el-test-sirve)).
- [ ] La **suite completa** pasa en verde.
- [ ] El **commit** está hecho con prefijo semántico (`feat:`, `fix:`, `docs:`, `chore:`,
      `refactor:`, `test:`) y en la rama del paso (`feat/fase-X`).
- [ ] El ROADMAP refleja el estado real del paso: la barra `- [x]` verde solo cuando está
      `validated`, y el texto entre paréntesis dice qué se hizo y con qué evidencia.
- [ ] Los valores técnicos que se tocan son los de su **doc de origen**; si un doc no fija el
      valor, se ha preguntado antes de decidirlo.
- [ ] No quedan **deudas silenciosas**: lo que no se ha hecho está anotado como tal
      (ROADMAP, `GAIA_RECOMENDACIONES.md` o comentario `ponytail:` en el código).

## 3. Cómo se verifica cada punto

| Punto del checklist | Cómo se comprueba                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Criterio verificado | Salida del comando en la conversación o en el cuerpo del commit.                                    |
| Test que ata        | El test falla al mutar el comportamiento (no antes de escribirlo se ve rojo por la razón correcta). |
| Suite completa      | `uv run pytest -q` en `backend/`; `npm test` y `npm run lint` en `frontend/`.                       |
| Lint y tipos        | `npm run lint` (oxlint con `--deny-warnings`) y `tsc -b` dentro de `npm run build`.                 |
| Cobertura           | `fail_under = 60` en `backend/pyproject.toml`; la salida de pytest incluye el porcentaje.           |
| E2E                 | `npm run test:e2e` en `frontend/`, que levanta Vite y uvicorn.                                      |
| Pre-commit          | `lint-staged` (prettier) deja el resultado; un fallo suyo se arregla, no se salta.                  |

Los comandos exactos de cada capa están en [`AGENTS.md`](../AGENTS.md) y en la
[Guía de Despliegue](./GAIA_DEPLOYMENT.md).

## 4. Mutación: cómo se sabe que el test sirve

Un test que pasa no demuestra nada por sí solo. Antes de dar un paso por terminado se
comprueba que el test **detecta** la ruptura del comportamiento: se cambia el código a mano,
se ve que el test se pone rojo **y solo ese**, y se restaura el código.

Ejemplos de mutación ya usadas en el proyecto:

| Paso   | Mutación                                | Test que cae                                             |
| ------ | --------------------------------------- | -------------------------------------------------------- |
| 0.2.1  | `RedisConnectionError` → `ValueError`   | `test_health_no_falla_si_redis_cae`                      |
| 0.6.7  | Retención de `api_log` 90 d → 30 d      | `test_la_retencion_del_log_son_los_90_dias_del_doc`      |
| 0.6.8  | `except` del fail-open → `ValueError`   | `test_una_peticion_normal_tambien_se_sirve_si_redis_cae` |
| 0.6.9  | `"live"` → `"loading"` en el write path | `un dato mock deja el módulo en live`                    |
| 0.6.10 | `fail_under` 60 % → 99 %                | La suite entera                                          |
| 0.6.11 | `debugger` en un fichero                | `npm run lint` (exit 1)                                  |

Una mutación que tumba **más** tests de los previstos también es válida: significa que el
comportamiento estaba atado en más sitio del que se pensaba.

## 5. Excepciones

- **Docs**: un cambio de documentación no lleva test; la evidencia es el diff y la
  coherencia verificada con greps (contrato, endpoints, stack, `/api/quakes` → 0).
- **Configuración pura**: si no existe comando que la ejecute, el paso no es
  verificable y hay que decirlo en vez de darlo por bueno.
- **Deuda knowingly pospuesta**: cuando un hueco se aplaza a otra fase, el paso se marca
  `completed` solo si su Criterio sigue cumpliéndose; si no, se anota como pendiente
  explícito.

## 6. Relación con el resto de documentos

- [`GAIA_ROADMAP.md`](./GAIA_ROADMAP.md) — de dónde salen los pasos, sus Criterios y sus
  Estimados; aquí no se duplican.
- [`AGENTS.md`](../AGENTS.md) — reglas de oro, estados del paso y reglas de commit.
- [`GAIA_TESTING.md`](./GAIA_TESTING.md) — qué prueba existe para cada capa y métricas de
  rendimiento.
- [`GAIA_DEPLOYMENT.md`](./GAIA_DEPLOYMENT.md) — comandos de verificación en local y CI/CD.

---

_Este documento complementa la [Especificación Técnica](./GAIA_SPECIFICATION.md) del proyecto GAIA._

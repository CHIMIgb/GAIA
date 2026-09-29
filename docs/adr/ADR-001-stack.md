# ADR-001 — Decisión de stack

> **Proyecto:** GAIA 3D
> **Estado:** Aceptado
> **Versión del Documento:** 1.0
> **Fecha:** 2026-09-28
> **Alcance:** qué tecnología se usa en cada capa y por qué se descartaron las otras. **No fija cifras**: TTL, rate limits, retención, draw calls y presupuestos viven en el doc de cada tema (`ROADMAP` §17) y aquí solo se referencian.

---

## 1. Contexto

GAIA tiene que cumplir siete requisitos no funcionales a la vez sobre la misma página: tasa de refresco fluida y un techo estricto de draw calls (`SPEC` RNF-01, RNF-02), cómputo fuera del hilo principal (RNF-03), cero fugas de memoria en GPU (RNF-04), degradación limpia cuando una fuente o una caché caen (RNF-05), primer pintado rápido (RNF-06) y cobertura de navegadores (RNF-07). Encima hay que reconciliar cinco fuentes externas con cadencias y unidades distintas (`DATA_SOURCES`), respetar un contrato único en todos los endpoints (`API_CONTRACT`) y guardar histórico consultable (`DATABASE`).

El punto que obliga a decidir el stack **jointo** y no pieza a pieza es que los requisitos se cruzan entre capas:

- RNF-03 empuja el cómputo a Web Workers, y eso obliga a un estado que el bucle de render pueda mutar 60 veces por segundo sin despertar a React en cada frame.
- RNF-02 empuja a instanciar todo, y eso es una pregunta de Three.js, no de React: un árbol de componentes con miles de nodos no llega al techo de draw calls por más memoización que se le ponga.
- El histórico y sus consultas son una decisión de base de datos, no de frontend, y condiciona el modelo de datos que consume la API.

## 2. Decisión

| Capa                     | Tecnología                             | Justificación por tecnología  |
| ------------------------ | -------------------------------------- | ----------------------------- |
| Lenguaje y build         | TypeScript en modo estricto, Vite      | `TECH_STACK` §2.1, §2.2       |
| 3D y shaders             | Three.js + GLSL                        | `TECH_STACK` §2.3             |
| UI y HUD                 | React                                  | `TECH_STACK` §2.4             |
| Estado                   | Valtio                                 | `TECH_STACK` §2.5             |
| Concurrencia             | Web Workers nativos + Comlink          | `TECH_STACK` §2.6             |
| Backend                  | FastAPI sobre Python                   | `TECH_STACK` §2.7             |
| Estilos                  | Tailwind CSS                           | `TECH_STACK` §2.8             |
| Caché y rate limiting    | Redis `>=5` con la API `redis.asyncio` | `DEPLOYMENT` §4               |
| Persistencia e histórico | PostgreSQL 18 + TimescaleDB            | `TECH_STACK` §2.7, `DATABASE` |

La regla de oro del proyecto es que este stack no se vuelve a abrir: `AGENTS.md` lo declara fijo y no re-negociable. Cambiar una fila de esta tabla no es editar este documento, es escribir un ADR-002 que lo sustituya.

## 3. Alternativas consideradas

Solo se listan las que están **documentadas**. El silencio de un doc no es una decisión tomada, y rellenar una razón inventada sería peor que reconocer que no existe.

### 3.1 Decididas y documentadas

| Alternativa                        | Por qué se descartó                                                                                                                           | Dónde está escrito                 |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Webpack en lugar de Vite           | Configuración y tiempo de arranque en desarrollo; el grafo de módulos de Vite ya cubre el code splitting que necesitan los chunks de Three.js | `TECH_STACK` §2.2                  |
| Jotai o Zustand en lugar de Valtio | El estado de la escena se muta desde el bucle de render; Valtio usa Proxy de JavaScript y notifica sin clonar                                 | `TECH_STACK` §2.5                  |
| `aioredis` en lugar de `redis>=5`  | `aioredis` está fusionado en `redis-py` desde la 4.2: `redis.asyncio` es su sucesor mantenido, no un paquete aparte                           | `DEPLOYMENT` §4, `RECOMENDACIONES` |
| `slowapi` para el rate limiting    | El middleware es custom sobre Redis: `slowapi` no da el token bucket con la redistribución por IP que pide `SECURITY`                         | `RECOMENDACIONES`                  |

### 3.2 Sin alternativa documentada

Estas tecnologías están elegidas y son las que están en uso, pero **ningún doc registra qué se descartó ni por qué**:

- **Python en el backend en lugar de Node/TypeScript.** No hay comparación registrada con un backend Node.
- **PostgreSQL + TimescaleDB en lugar de otro almacén.** No hay comparación registrada con, por ejemplo, un store de series temporales dedicado o un almacén documental.

Queda anotado como deuda de documentación, no como decisión pendiente de tomar: si alguien necesita defender una de estas dos filas en una revisión, el argumento hay que escribirlo primero.

## 4. Consecuencias

**A favor**

- RNF-03 tiene una traducción literal: tres Workers con un canal tipado por Comlink, y no un `setTimeout` fingiendo concurrencia.
- RNF-02 tiene dónde apoyarse: `InstancedMesh` para los miles de puntos de una capa, en vez de un nodo por punto.
- El contrato `{ success, data, error }` se puede imponer en la frontera con Pydantic, no por convención.
- El histórico vive en el mismo motor que el estado transaccional, así que una consulta de ventana no necesita otro sistema.

**En contra**

- Dos lenguajes y dos cadenas de herramientas para un solo producto. Se paga en dependencias, en tipado duplicado y en contexto mental.
- TimescaleDB es una extensión: un despliegue que solo ofrezca PostgreSQL vanilla no cumple el contrato, y eso se comprueba tarde.
- **Chromium headless no tiene GPU, así que el objetivo de frame de `SPEC` RNF-01 no se puede gatear en CI.** Es la razón de que la medición de 0.7.15 emita valores y no bloquee: una puerta que se pasa siempre da una confianza falsa.
- El dev server de Vite no sirve para medir el FCP de RNF-06; por eso esa medición (0.7.4) se hace sobre el build de producción con `vite preview`.

## 5. Referencias

- [`GAIA_TECH_STACK.md`](../GAIA_TECH_STACK.md) — justificación técnica de cada tecnología. La fuente de este ADR, no su gemelo.
- [`GAIA_SPECIFICATION.md`](../GAIA_SPECIFICATION.md) — RNF-01 a RNF-07, los requisitos que motivan la decisión.
- [`GAIA_ROADMAP.md`](../GAIA_ROADMAP.md) §17 — controles numéricos transversales.
- [`GAIA_ARCHITECTURE.md`](../GAIA_ARCHITECTURE.md) — qué hay montado de F0 a F1 con este stack.
- [`GAIA_DEPLOYMENT.md`](../GAIA_DEPLOYMENT.md) §4 — versiones de las dependencias del backend.

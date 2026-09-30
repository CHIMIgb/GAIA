# GAIA — Performance

> **Versión del Documento:** 2.7
> **Fecha:** 2026-09-29
> **Propósito:** presupuestos, umbrales y baselines de rendimiento de GAIA. Referencia, no fuente: los valores canónicos viven en su doc de origen y aquí solo se citan.

## 1. Regla de este documento

Este doc **no fija ni repite** cifras técnicas. Cada valor vive en el doc que lo define
—`SPEC` para los RNF, `TESTING` para los presupuestos de bundle, `ROADMAP` §17 para la
tabla resumen— y aquí se referencia con su sección. Si un valor aparece aquí y su doc de
origen cambia, esta tabla queda obsoleta: por eso no se duplican.

Cuando un valor **no existe** en ningún doc, la casilla se marca `PENDIENTE` en vez de
rellenarse con una estimación. Un presupuesto inventado es peor que ninguno: el día que
se compare un baseline contra él, el error pasa desapercibido porque el número parece
real.

## 2. Presupuestos canónicos (referenciados)

| Métrica                     | Objetivo    | Fuente                        | Cómo se mide hoy                                                                        |
| --------------------------- | ----------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| FPS                         | 60 estables | `SPEC` RNF-01                 | `DevOverlay` (paso 0.7.1), ventana de 120 frames                                        |
| p95 de frame                | ≤ 18 ms     | `SPEC` RNF-01, `ROADMAP` §17  | `DevOverlay` (paso 0.7.1)                                                               |
| Draw calls por fotograma    | ≤ 8         | `SPEC` RNF-02                 | `renderer.info` vía `registerDrawCallsSource`; `n/d` hasta que exista la escena (1.1.1) |
| FCP                         | < 2.0 s     | `SPEC` RNF-06, `TESTING` §3.2 | `npm run fcp`, Playwright + `PerformanceObserver` (0.7.4)                               |
| Globo interactivo funcional | < 3.5 s     | `SPEC` RNF-06                 | Lighthouse (paso 11.2.1); `n/d` hasta que exista el globo (1.1.1)                       |
| Bundle JS inicial (gzip)    | ≤ 450 KB    | `SPEC` RNF, `TESTING` §3.4    | `npm run perf:check` (paso 0.7.3)                                                       |
| Chunk de arranque (gzip)    | ≤ 180 KB    | `TESTING` §3.4                | `npm run perf:check`                                                                    |
| Chunk Three.js (gzip)       | ≤ 250 KB    | `TESTING` §3.4                | `npm run perf:check`, en F1                                                             |
| Chunk React + HUD (gzip)    | ≤ 120 KB    | `TESTING` §3.4                | `npm run perf:check`                                                                    |
| Perfil de red de referencia | 4G          | `TESTING` §3.3                | CDP `Network.emulateNetworkConditions` en `npm run fcp`                                 |
| Datos simultáneos máximos   | > 20 000    | `SPEC` RNF-01                 | F10 (instancing, LOD, octree)                                                           |

## 3. Presupuestos de assets por módulo

**Estado: `PENDIENTE`.** Ningún doc del proyecto fija hoy un tamaño de textura ni de
shader, así que esta tabla no puede rellenarse sin inventar. `TESTING` §3.4 solo
establece que las texturas van _streaming por tiles_; `GLOBE_TEXTURES` cataloga las APIs
del globo, no tamaños.

Cada fila se rellena al abrir su módulo (F2–F6), con el tamaño real medido en el asset
que genera ese módulo, no con una estimación de partida.

| Módulo          | Asset a presupuestar                        | Límite | Estado      | Se fija en |
| --------------- | ------------------------------------------- | ------ | ----------- | ---------- |
| Globo base      | Textura satelital, heightmap, coastline     | —      | `PENDIENTE` | 1.1.x      |
| Fuego (F2)      | Textura de gradiente FRP / sprite de foco   | —      | `PENDIENTE` | F2         |
| Sismos (F3)     | Textura de onda, cilindro base              | —      | `PENDIENTE` | F3         |
| Viento (F4)     | `DataTexture` de la rejilla u/v             | —      | `PENDIENTE` | F4         |
| Inundación (F5) | Heightmap de nivel del mar, máscara costera | —      | `PENDIENTE` | F5         |
| Radiación (F6)  | Heatmap y alerta cromática                  | —      | `PENDIENTE` | F6         |

## 4. Baselines

Un baseline es la medida del estado actual del proyecto, versionada, contra la que se
comparan las siguientes. Sirve para distinguir "ha ido mal" de "ya iba mal".

- **Qué se mide hoy:** el bundle gzip, vía `npm run perf:check` (`frontend/scripts/bundle-budget.mjs`), y el FCP, vía `npm run fcp` (`frontend/tests/fcp/fcp.spec.ts`).
- **Dónde vive el fichero:** `docs/performance/baseline.json`, decidido en 0.7.12 con
  el usuario. JSON y no tabla de este doc porque tiene que ser legible por un programa
  sin escribir un parser de markdown: `metricas` es la última buena de cada métrica (lo
  contra lo que compara) y `historial` es un array con una entrada por sesión de
  medición, cada una con su fecha, commit, Node y Vite. Las claves llevan la unidad
  (`_kib`, `_ms`) para que el comparador no necesite una tabla de unidades. Se corrigió
  el CSS de 1.47 a 1.44 KiB: son 1472 bytes medidos, y un baseline que no cuadra con el
  build hace que el gate dé un falso positivo el primer día.
- **Cómo se compara:** `npm run perf:baseline` (raíz) mide lo de hoy con
  `frontend/scripts/bundle-budget.mjs` y falla si algo empeora más del **1 %**. El
  margen no es 0 a propósito: el tamaño gzip se mueve con cualquier cambio de versión
  de vite o esbuild sin que cambie el bundle, y con 0 el gate no distinguiría "ha
  entrado Three.js" de "ha subido vite a 8.3.2". Corre en CI después de `perf:check`.
- **Qué no llega al gate:** el FCP. `medir()` no lo produce —medirlo necesita navegador,
  build y `vite preview`— así que en la comparativa sale como `n/d (este script no lo
mide)`, no como un 0 que parecería una mejora. Es la puerta que sí existe
  (`perf:check`) y la que no (`npm run fcp`, sin paso en CI); cerrar esa segunda es
  deuda abierta, no parte de este paso.
- **Comparativa:** cada medición posterior anota la diferencia contra el baseline
  guardado, no contra el presupuesto. El presupuesto dice si se pasa; el baseline dice
  si se ha empeorado.

### 4.1 Baseline del bundle (paso 0.7.3)

| Medida                   | Baseline   | Presupuesto                     | Margen                    |
| ------------------------ | ---------- | ------------------------------- | ------------------------- |
| JS inicial (gzip)        | 198.99 KiB | ≤ 450 KB (`DEPLOYMENT` §5.1)    | 251 KiB libre, 44 % usado |
| Chunk de arranque (gzip) | 67.88 KiB  | ≤ 180 KB (`DEPLOYMENT` §5.1)    | 112 KiB libre, 38 % usado |
| Chunk Three.js           | 131.39 KiB | ≤ 250 KB (`DEPLOYMENT` §5.1)    | 119 KiB libre, 53 % usado |
| CSS (gzip)               | 0.35 KiB   | sin límite fijado en ningún doc | —                         |

- **Medido el** 2026-09-29 con Node v22.19.0 y Vite 8.3.1:
  `npm run build && npm run perf:check`. Las cifras actuales son las de 1.2.2 (la
  atmósfera); las de 1.1.2 quedaban en `198.56` / `67.17` y están en el historial de
  `docs/performance/baseline.json`.
- **El +1,1 % del arranque es el shader de 1.2.2, no una regresión.** Antes de aceptarlo
  se quitaron los comentarios que estaban **dentro** de los dos shaders: el minificador no
  toca el interior de un template literal, así que cada línea de comentario GLSL se
  contaba como peso. Medido: `68.46 → 67.88 KiB`, −0,58 KiB. Los ~0,7 KiB que quedan son
  el shader y el módulo, que es código que hace falta. El chunk de Three.js no se mueve
  (131.39 KiB) porque el shader es propio, no una clase de Three.
- **Dos chunks desde 1.1.1.** Antes de entrar Three.js el build era un solo chunk
  (`index-*.js`, 21 módulos) y React iba dentro del arranque; con el motor montado,
  `codeSplitting` en `frontend/vite.config.ts` saca Three.js a `three-*.js` y deja el
  arranque en 67.17 KiB. No es decoración: el gate mide por separado el arranque (180 KB)
  y el de three (250 KB) y localiza este último por el nombre del fichero, así que sin
  el split los 198 KiB del motor caerían dentro del arranque y se medirían contra un
  límite que `DEPLOYMENT` §5.1 nunca puso para él.
- **El salto del JS inicial (66.8 → 198.56 KiB) es el motor entrando**, no una regresión:
  es lo que anticipa `PROJECT_STRUCTURE` §7 ("el bundle es hoy un único chunk porque la
  grafo es React + Valtio... todavía no hay `three`") y lo que fija el 43 % de los 450 KiB
  de presupuesto. `OrbitControls` añade 5,3 KiB más en 1.1.2, dentro del chunk de three.
- **Cuándo se vuelve a medir el baseline:** cuando el cambio que engorda el bundle es
  deliberado —una dependencia o una funcionalidad nueva—, no cuando aparece una delta sin
  explicación. Un gate que se re-declara en cada commit no distingue "ha entrado la cámara
  orbital" de "ha subido esbuild a 8.3.2", que es justo lo que tiene que distinguir. Cada
  re-medición deja su entrada en el historial de `baseline.json` con su `commit`.
- **Dos cifras para la misma medida:** el footer de Vite y `perf:check` no coinciden
  porque no es el mismo nivel de compresión ni la misma base. Gana la de `perf:check`,
  que es la que se compara contra el presupuesto y contra el baseline, porque es la que
  usa el mismo criterio siempre.

### 4.2 Baseline del FCP (paso 0.7.4)

| Medida             | Baseline | Presupuesto            | Margen                   |
| ------------------ | -------- | ---------------------- | ------------------------ |
| FCP (mediana de 3) | 352 ms   | < 2 s (`TESTING` §3.1) | 1.65 s libre, 18 % usado |

- **Medido el** 2026-09-28 con `npm run fcp`: el build de producción servido por
  `vite preview`, navegado con el perfil 4G de `TESTING` §3.3 emulado por CDP
  (`Network.emulateNetworkConditions`, RTT 40 ms, 9 Mbps de bajada, 1 Mbps de subida).
  Carreras 360 / 340 / 352 ms; se publica la **mediana** porque la primera carrera
  paga el arranque en frío de la máquina y no describe al usuario.
- **Herramienta: Playwright + `PerformanceObserver`, no Lighthouse.** Es una desviación
  consciente de `TESTING` §3.1: el perfil por defecto de Lighthouse es _Slow 4G_
  (150 ms RTT, 1.6 Mbps), que no es el 4G que fija `TESTING` §3.3, así que su cifra
  no sería comparable con el resto de este doc. Playwright ya era dependencia del E2E,
  de modo que no se añade nada al bundle ni al toolchain. La desviación queda anotada
  en el ROADMAP; Lighthouse entra donde el propio roadmap lo sitúa, en 11.2.1.
- **Es una cifra del scaffold,** no un objetivo: cuando entren el globo y los módulos,
  lo que se compara es la diferencia contra este número, no el absoluto.

## 5. Herramientas de medición (estado real, no la prescripción)

| Qué                      | Herramienta                                                             | Estado                                          |
| ------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------- |
| Presupuesto de bundle    | `npm run perf:check` + `bundle-budget.mjs`                              | En uso desde 0.6.x                              |
| Métricas de frame en dev | `DevOverlay` (FPS, p95, draw calls)                                     | Desde 0.7.1                                     |
| Duración por endpoint    | Línea `duración …avg=…p95=…` con `DEBUG`                                | Desde 0.7.2                                     |
| Frames largos            | `DevOverlay` (contador) + `PerformanceObserver('long-animation-frame')` | Desde 0.7.7 — ver la nota de dos umbrales       |
| FCP                      | `npm run fcp` (Playwright + `PerformanceObserver`)                      | Desde 0.7.4 — baseline en §4.2                  |
| Análisis por chunk       | `npm run analyze` (`rollup-plugin-visualizer`)                          | Desde 0.7.6 — treemap HTML en `dist/stats.html` |

### 5.1 Los dos umbrales de los frames largos (0.7.7)

El criterio de 0.7.7 pide detectar tareas de más de 16 ms, pero el presupuesto por frame
de 60 Hz es 16.67 ms (`TESTING` §3.2): a 60 Hz _todo_ frame dura eso, así que un umbral
de 16 contaría el 100 % de los frames. El contador usa por eso el otro umbral del mismo
doc, **p95 ≤ 18 ms**, que además es el que no se llena de ruido: medido en este repo, con
16.67 ms una app sana marcaba 30 de 46 frames sin un solo tirón.

Y hay un techo que ningún umbral de GAIA puede bajar por sí solo: las APIs del navegador
que atribuyen el bloqueo solo existen a partir de **50 ms** (`PerformanceLongTaskTiming`
en MDN). Por eso el overlay lleva dos detecciones que no se solapan:

| Señal               | Umbral | Qué contesta                                              |
| ------------------- | ------ | --------------------------------------------------------- |
| `lframe` (contador) | 18 ms  | ¿cuántos frames se pasaron de presupuesto?                |
| `loaf` (atribución) | 50 ms  | ¿cuánto duró el frame bloqueado? (el contador no lo sabe) |

**Desviación de herramienta, medida no supuesta:** la atribución se hace con
`long-animation-frame` (LoAF) y no con `longtask`, que es lo que daba la primera versión de
esta tabla. La razón está medida en el repo, no es una preferencia: en Chromium headless
`longtask` no emite ninguna entrada ni con un bloqueo de 1 200 ms
(`performance.getEntriesByType('longtask')` devuelve 0), mientras LoAF reporta 182 ms por
un bloqueo de 180 ms, 610 por 600 y 1 217 por 1 200. Con `longtask` la mitad de la
detección sería inverificable y saldría siempre en `0`.

LoAF es Chromium-only, como lo era `longtask`: en Firefox y Safari `supportedEntryTypes`
no lo lista y el overlay muestra `n/d` en vez de un 0 que parecería una medición.

## 6. Trazabilidad

| Paso del ROADMAP | Qué aporta a este doc                                |
| ---------------- | ---------------------------------------------------- |
| 0.7.1            | Métricas de frame en dev                             |
| 0.7.3            | Baseline del bundle                                  |
| 0.7.4            | FCP base del scaffold                                |
| 0.7.5            | §3, presupuestos de assets por módulo                |
| 0.7.6            | Análisis por chunk, para identificar módulos pesados |
| 0.7.7            | Detección de tareas largas                           |
| 0.7.8            | Este documento                                       |
| 0.7.11           | Bloque de rendimiento en el README                   |
| 0.7.12           | Fichero de baseline versionado                       |

## Enlaces

- `docs/GAIA_SPECIFICATION.md` — RNF-01 (FPS), RNF-02 (draw calls), RNF-06 (FCP).
- `docs/GAIA_TESTING.md` — §3.2 métricas, §3.3 perfiles de red, §3.4 presupuesto de bundle, §9 lint.
- `docs/GAIA_ROADMAP.md` — §17 tabla canónica; grupo 0.7 (benchmarks).
- `docs/GAIA_GLOBE_TEXTURES.md` — APIs y assets del globo (sin presupuestos de tamaño).
- `docs/GAIA_DEPLOYMENT.md` — checks de rendimiento en CI y umbrales de degradación.

# GAIA — Performance

> **Versión del Documento:** 1.0
> **Fecha:** 2026-09-27
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
| FCP                         | < 2.0 s     | `SPEC` RNF-06, `TESTING` §3.2 | Lighthouse / web-vitals (paso 0.7.4)                                                    |
| Globo interactivo funcional | < 3.5 s     | `SPEC` RNF-06                 | Lighthouse (paso 0.7.4)                                                                 |
| Bundle JS inicial (gzip)    | ≤ 450 KB    | `SPEC` RNF, `TESTING` §3.4    | `npm run perf:check` (paso 0.7.3)                                                       |
| Chunk de arranque (gzip)    | ≤ 180 KB    | `TESTING` §3.4                | `npm run perf:check`                                                                    |
| Chunk Three.js (gzip)       | ≤ 250 KB    | `TESTING` §3.4                | `npm run perf:check`, en F1                                                             |
| Chunk React + HUD (gzip)    | ≤ 120 KB    | `TESTING` §3.4                | `npm run perf:check`                                                                    |
| Perfil de red de referencia | 4G          | `TESTING` §3.3                | Configuración de throttling                                                             |
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

- **Qué se mide hoy:** el bundle gzip, vía `npm run perf:check` (`frontend/scripts/bundle-budget.mjs`).
- **Dónde vive el fichero:** `PENDIENTE`. El paso 0.7.12 debe decidir ruta y formato;
  este doc solo deja constancia de que el baseline es un dato versionado, no un script,
  así que no va en `scripts/`.
- **Comparativa:** cada medición posterior anota la diferencia contra el baseline
  guardado, no contra el presupuesto. El presupuesto dice si se pasa; el baseline dice
  si se ha empeorado.

### 4.1 Baseline del bundle (paso 0.7.3)

| Medida                   | Baseline | Presupuesto                     | Margen                          |
| ------------------------ | -------- | ------------------------------- | ------------------------------- |
| JS inicial (gzip)        | 66.8 KiB | ≤ 450 KB (`DEPLOYMENT` §5.1)    | 383 KiB libre, 15 % usado       |
| Chunk de arranque (gzip) | 66.8 KiB | ≤ 180 KB (`DEPLOYMENT` §5.1)    | 113 KiB libre, 37 % usado       |
| Chunk Three.js           | `n/d`    | ≤ 250 KB (`DEPLOYMENT` §5.1)    | se mide en 1.1.1, cuando exista |
| CSS (gzip)               | 1.47 KiB | sin límite fijado en ningún doc | —                               |

- **Medido el** 2026-09-27 sobre `f6c6abe`, con Node v22.19.0 y Vite 8.3.1:
  `npm run build && npm run perf:check`.
- **El baseline es un solo chunk.** El build emite únicamente `index-*.js` (21 módulos)
  porque `frontend/vite.config.ts` todavía no define `manualChunks`, que es lo que
  prescriben `DEPLOYMENT` §5.1 y `TESTING` §3.4. React y la app van dentro del chunk de
  arranque. Cuando se añada el code splitting, el **total** seguirá siendo comparable
  chunk a chunk no: el mismo byte pasa de "arranque" a "React + HUD", y comparar antes de
  eso produce un falso positivo.
- **Dos cifras para la misma medida:** el footer de Vite imprime 69.30 kB y `perf:check`
  66.8 KiB. Es el mismo fichero con distinto nivel de compresión y base: con nivel 6 el
  chunk mide 67.0 KiB (comprobado). Gana la de `perf:check`, que es la que se compara
  contra el presupuesto, porque es la que usa el mismo criterio siempre.

## 5. Herramientas de medición (estado real, no la prescripción)

| Qué                      | Herramienta                                | Estado                                                                                                                 |
| ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Presupuesto de bundle    | `npm run perf:check` + `bundle-budget.mjs` | En uso desde 0.6.x                                                                                                     |
| Métricas de frame en dev | `DevOverlay` (FPS, p95, draw calls)        | Desde 0.7.1                                                                                                            |
| Duración por endpoint    | Línea `duración …avg=…p95=…` con `DEBUG`   | Desde 0.7.2                                                                                                            |
| Tareas largas (> 16 ms)  | `PerformanceObserver('longtask')`          | Pendiente (0.7.7)                                                                                                      |
| FCP                      | Lighthouse                                 | Pendiente (0.7.4)                                                                                                      |
| Análisis por chunk       | `rollup-plugin-visualizer` o `size-limit`  | Pendiente (0.7.6); `TESTING` §3.4 lo menciona, `PROJECT_STRUCTURE` §2 lo presupone en `vite.plugins.ts`, que no existe |

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

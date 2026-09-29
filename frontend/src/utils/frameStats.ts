/**
 * Estadística de frame del overlay de desarrollo (ROADMAP 0.7.1).
 *
 * Vive en `utils/` y no en el componente a propósito: es lógica pura, se testea sin
 * navegador y `oxlint` (`react/only-export-components`) exige que un fichero de
 * componente solo exporte componentes.
 */

/** Muestras de frame que se guardan; a 60 FPS son los últimos ~2 s. */
export const WINDOW_FRAMES = 120;

/**
 * Presupuesto por frame: `TESTING` §3.2 fija p95 ≤ 18 ms, y es el umbral con el que se
 * cuenta un frame largo.
 *
 * No se usa el 16.67 ms del frame budget de 60 Hz: el vsync real jitterea y una app sana
 * a 60 FPS se pasa de 16.67 ms en dos de cada tres frames, así que con ese umbral el
 * contador marcaba 30 de 46 frames sin que hubiera un solo tirón. 18 ms sigue
 * capturando los frames perdidos de verdad (33, 50, 66 ms) sin contar ruido.
 */
export const LONG_FRAME_MS = 18;

/**
 * Frames largos que se guardan. Solo las entradas que el navegador reporta (≥ 50 ms, ver
 * `summarizeLongTasks`), así que 20 es de sobra para leer la ventana.
 */
export const WINDOW_LONG_TASKS = 20;

export interface FrameStats {
  /** Fotogramas por segundo medios de la ventana. */
  fps: number;
  /** p95 del tiempo de frame en ms: el percentil que ve el usuario, no el promedio. */
  p95Ms: number;
  /** Cuántas muestras hay en la ventana. */
  frames: number;
  /** Frames de la ventana que pasaron de `LONG_FRAME_MS`. */
  longFrames: number;
  /** Draw calls del último frame, o `null` si todavía no hay renderer. */
  drawCalls: number | null;
}

export interface LongTaskStats {
  /** Cuántas tareas largas hay en la ventana. */
  tasks: number;
  /** La peor de ellas en ms, o `null` si no se observó ninguna. */
  worstMs: number | null;
}

/**
 * Estructura mínima de un renderer de Three.js para leer sus draw calls.
 * Deliberadamente estructural: así este módulo no importa Three.js, que todavía no es
 * dependencia (0.7.1) y cuya escena base es 1.1.1.
 */
export interface DrawCallsSource {
  info: { render: { calls: number } };
}

let drawCallsSource: DrawCallsSource | null = null;

/** Lo llama el render de F1 al crearse. `null` deja el contador en `n/d`. */
export function registerDrawCallsSource(source: DrawCallsSource | null): void {
  drawCallsSource = source;
}

/**
 * Estadísticas de la ventana de duraciones de frame (en ms).
 *
 * La p95 se ordena y se indexa al 95 %: el promedio se lo come un pico de GC y con él
 * se va la sensación de fluidéz, que es lo que RNF-01 mide.
 */
export function computeStats(samples: number[]): FrameStats {
  if (samples.length === 0) {
    return {
      fps: 0,
      p95Ms: 0,
      frames: 0,
      longFrames: 0,
      drawCalls: readDrawCalls(),
    };
  }
  const mean = samples.reduce((acc, ms) => acc + ms, 0) / samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return {
    fps: mean > 0 ? 1000 / mean : 0,
    p95Ms: p95,
    frames: samples.length,
    longFrames: samples.filter((ms) => ms > LONG_FRAME_MS).length,
    drawCalls: readDrawCalls(),
  };
}

/**
 * Resume las duraciones que reporta `PerformanceObserver('long-animation-frame')`.
 *
 * Ojo al umbral: LoAF solo entrega frames de **50 ms o más**, así que esta función no ve
 * nada entre 18 y 50 ms — esa franja la cuenta `computeStats` en el bucle de rAF. Por eso
 * las dos detecciones son complementarias y no dos formas de medir lo mismo: el contador
 * de frames no sabe *por qué* el frame fue largo, y aquí sí se ve cuánto duró.
 */
export function summarizeLongTasks(durations: number[]): LongTaskStats {
  if (durations.length === 0) {
    return { tasks: 0, worstMs: null };
  }
  return { tasks: durations.length, worstMs: Math.max(...durations) };
}

function readDrawCalls(): number | null {
  // `info.render.calls` se resetea en cada frame; null = todavía sin renderer.
  return drawCallsSource ? drawCallsSource.info.render.calls : null;
}

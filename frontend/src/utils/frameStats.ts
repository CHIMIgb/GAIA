/**
 * Estadística de frame del overlay de desarrollo (ROADMAP 0.7.1).
 *
 * Vive en `utils/` y no en el componente a propósito: es lógica pura, se testea sin
 * navegador y `oxlint` (`react/only-export-components`) exige que un fichero de
 * componente solo exporte componentes.
 */

/** Muestras de frame que se guardan; a 60 FPS son los últimos ~2 s. */
export const WINDOW_FRAMES = 120;

export interface FrameStats {
  /** Fotogramas por segundo medios de la ventana. */
  fps: number;
  /** p95 del tiempo de frame en ms: el percentil que ve el usuario, no el promedio. */
  p95Ms: number;
  /** Cuántas muestras hay en la ventana. */
  frames: number;
  /** Draw calls del último frame, o `null` si todavía no hay renderer. */
  drawCalls: number | null;
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
    return { fps: 0, p95Ms: 0, frames: 0, drawCalls: readDrawCalls() };
  }
  const mean = samples.reduce((acc, ms) => acc + ms, 0) / samples.length;
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return {
    fps: mean > 0 ? 1000 / mean : 0,
    p95Ms: p95,
    frames: samples.length,
    drawCalls: readDrawCalls(),
  };
}

function readDrawCalls(): number | null {
  // `info.render.calls` se resetea en cada frame; null = todavía sin renderer.
  return drawCallsSource ? drawCallsSource.info.render.calls : null;
}

/**
 * Time-lapse de rendimiento (ROADMAP 1.6.2).
 *
 * El criterio de 1.6.2 es "≥ 50 FPS medio con el globo solo, sin subidas de memoria
 * sostenidas", y son dos preguntas que el overlay de 0.7.1 no podía contestar: su ventana son
 * los últimos 120 frames (~2 s), así que no es un time-lapse, y no leía
 * `renderer.info.memory`, que es donde vive la segunda mitad del criterio.
 *
 * La lógica es pura y vive aquí —como la de `frameStats` y por el mismo motivo— para poder
 * probarla sin navegador; el `DevOverlay` solo la alimenta y la pinta.
 */
import { computeStats, readSource } from "./frameStats";

/** Longitud del time-lapse del criterio: 30 s. */
export const DURACION_TIMELAPSE_MS = 30_000;

/** FPS medio mínimo del criterio de 1.6.2 con el globo solo. */
export const FPS_MINIMO_CRITERIO = 50;

/**
 * Una muestra de memoria, una por segundo.
 *
 * Van en una lista aparte de los deltas de frame a propósito: los frames se miden cada
 * ~16,7 ms y la memoria se lee una vez por segundo, y confundirlas daría un FPS de 1. Son
 * dos cadencias distintas de dos preguntas distintas.
 */
export interface MuestraMemoria {
  /** Milisegundos desde el inicio del time-lapse. */
  tMs: number;
  /** Geometrías vivas en la GPU, o `null` si todavía no hay renderer. */
  geometries: number | null;
  /** Texturas en VRAM, o `null` si no hay renderer. */
  textures: number | null;
  /** Draw calls del frame en el que se tomó la muestra, o `null`. */
  drawCalls: number | null;
}

export interface ResumenTimeLapse {
  /** Duración real medida, en ms. */
  duracionMs: number;
  /** FPS medio de todo el intervalo. */
  fpsMedio: number;
  /** p95 de frame del intervalo. */
  p95Ms: number;
  /** Frames contados. */
  frames: number;
  /** Geometrías y texturas al principio y al final del intervalo. */
  memoria: {
    geometrias: Extremos;
    texturas: Extremos;
  };
  /** Draw calls máximos del intervalo: lo que se ve en DevTools. */
  drawCallsMax: number | null;
  /** La memoria crece de forma sostenida (RNF-04). */
  fugaMemoria: boolean;
  /** Cumple el criterio de 1.6.2: FPS medio alto y sin fuga. */
  cumpleCriterio: boolean;
}

export interface Extremos {
  inicio: number | null;
  final: number | null;
  delta: number | null;
}

/**
 * Tolerancia de la fuga, en unidades de recurso.
 *
 * No es 0 a propósito: Three.js recompila programas cuando cambia un estado y eso mueve el
 * contador sin que haya fuga, así que con 0 el criterio marcaría fuga en el frame que toque
 * recompilar cualquier material. Dos recursos de más sobre una escena de ~4 es ruido.
 */
export const TOLERANCIA_FUGA = 2;

/** Mediana; con un número par, el promedio de los dos centrales. */
export function mediana(valores: number[]): number {
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

/**
 * ¿Sube la memoria de verdad, o solo es ruido del recolector?
 *
 * "Sostenida" es la palabra que importa en el criterio, y por eso la comparación va de la
 * **mediana** del primer tercio a la del último, no del primer punto al último ni con
 * medias:
 *
 * - Un pico suelto (un `dispose` al recompilar un shader, un cambio de LOD) mueve la media
 *   del último tercio y haría saltar el criterio; no mueve la mediana.
 * - Una fuga real sube cada muestra, así que la mediana del último tercio está claramente
 *   por encima de la del primero, y da igual dónde caiga el pico suelto.
 *
 * Se cuentan geometrías **y** texturas porque una fuga que solo crece en texturas —el atlas
 * que se recarga sin liberar el anterior— es igual de real.
 */
export function hayFugaMemoria(muestras: MuestraMemoria[]): boolean {
  const conValor = muestras.filter(
    (m) => m.geometries !== null && m.textures !== null,
  );
  if (conValor.length < 4) return false;

  const tercio = Math.max(1, Math.floor(conValor.length / 3));
  const primero = conValor.slice(0, tercio);
  const ultimo = conValor.slice(-tercio);

  const sube = (leer: (m: MuestraMemoria) => number | null): boolean => {
    const antes = mediana(primero.map((m) => leer(m) ?? 0));
    const despues = mediana(ultimo.map((m) => leer(m) ?? 0));
    return despues - antes > TOLERANCIA_FUGA;
  };

  return sube((m) => m.geometries) || sube((m) => m.textures);
}

/**
 * Resume el intervalo contra el criterio de 1.6.2.
 *
 * `cumpleCriterio` sale `false` sin inventar cifras cuando no hay muestras: un `true` sin
 * datos sería una puerta que se salta sola, que es justo lo que la nota de `baseline.json`
 * prohíbe para las métricas no medidas.
 */
export function resumirTimeLapse(
  deltasMs: number[],
  muestras: MuestraMemoria[],
): ResumenTimeLapse {
  const stats = computeStats(deltasMs);
  const ultima = muestras[muestras.length - 1];

  const extremos = (leer: (m: MuestraMemoria) => number | null): Extremos => {
    const conValor = muestras.filter((m) => leer(m) !== null);
    const inicio = conValor.length ? leer(conValor[0]) : null;
    const final = ultima ? leer(ultima) : null;
    return {
      inicio,
      final,
      delta: inicio === null || final === null ? null : final - inicio,
    };
  };

  const drawCalls = muestras
    .map((m) => m.drawCalls)
    .filter((c): c is number => c !== null);

  const resumen: ResumenTimeLapse = {
    duracionMs: ultima ? ultima.tMs : 0,
    fpsMedio: stats.fps,
    p95Ms: stats.p95Ms,
    frames: stats.frames,
    memoria: {
      geometrias: extremos((m) => m.geometries),
      texturas: extremos((m) => m.textures),
    },
    drawCallsMax: drawCalls.length ? Math.max(...drawCalls) : null,
    fugaMemoria: hayFugaMemoria(muestras),
    cumpleCriterio: false,
  };

  // Sin muestras de memoria no se puede afirmar "sin subidas sostenidas": `hayFugaMemoria`
  // devuelve `false` por falta de serie, y con solo eso un globo sin renderer daría el
  // criterio por cumplido. El criterio son dos preguntas y aquí hacen falta las dos.
  const haySerieDeMemoria = muestras.some((m) => m.geometries !== null);
  resumen.cumpleCriterio =
    stats.frames > 0 &&
    stats.fps >= FPS_MINIMO_CRITERIO &&
    haySerieDeMemoria &&
    !resumen.fugaMemoria;
  return resumen;
}

/** Una línea por métrica, para pegar en el issue o en el doc de rendimiento. */
export function formatearTimeLapse(resumen: ResumenTimeLapse): string {
  const n = (v: number | null): string => (v === null ? "n/d" : `${v}`);
  const signo = (d: number | null): string =>
    d === null ? "n/d" : `${d > 0 ? "+" : ""}${d}`;
  const g = resumen.memoria.geometrias;
  const t = resumen.memoria.texturas;

  return [
    `duración ${(resumen.duracionMs / 1000).toFixed(1)} s en ${resumen.frames} frames`,
    `fps medio ${resumen.fpsMedio.toFixed(1)} (criterio ≥ ${FPS_MINIMO_CRITERIO})`,
    `p95 ${resumen.p95Ms.toFixed(1)} ms`,
    `geo ${n(g.inicio)} → ${n(g.final)} (${signo(g.delta)})`,
    `tex ${n(t.inicio)} → ${n(t.final)} (${signo(t.delta)})`,
    `draw máx ${n(resumen.drawCallsMax)}`,
    `fuga de memoria ${resumen.fugaMemoria ? "SÍ" : "no"}`,
    `criterio 1.6.2 ${resumen.cumpleCriterio ? "cumple" : "NO CUMPLE"}`,
  ].join("\n");
}

/**
 * Un punto de memoria desde el renderer. `DevOverlay` no importa Three: el `renderer` llega
 * ya con la forma estructural de `frameStats`.
 */
export function leerMuestra(
  tMs: number,
  source = readSource(),
): MuestraMemoria {
  if (!source)
    return { tMs, geometries: null, textures: null, drawCalls: null };
  return {
    tMs,
    geometries: source.info.memory.geometries,
    textures: source.info.memory.textures,
    drawCalls: source.info.render.calls,
  };
}

/**
 * Overlay de desarrollo con FPS, p95 de frame, draw calls, memoria y time-lapse
 * (ROADMAP 0.7.1; memoria y time-lapse en 1.6.2).
 *
 * Solo se monta en dev: `App.tsx` lo importa dinámicamente tras `import.meta.env.DEV`,
 * así que en el build de producción la rama es código muerto y Vite la elimina del grafo
 * (criterio: "ocultable en prod"). Con `npm run build` no aparece ningún chunk suyo.
 *
 * Los draw calls y la memoria leen de una fuente registrada por el render de Three.js: el
 * motor la registra al crearse (ROADMAP 1.1.1) y la suelta al destruirse. Sin renderer
 * quedan como `n/d` en vez de inventarse un número.
 *
 * El time-lapse (tecla `t`) es lo que mide el criterio de 1.6.2 —"≥ 50 FPS medio con el globo
 * solo, sin subidas de memoria sostenidas"—: su ventana normal son 120 frames (~2 s), que no
 * son 30 s y no dicen nada sobre una fuga lenta. Aquí se acumulan los deltas de frame de
 * verdad y una muestra de memoria por segundo, y al terminar se imprime el informe que se
 * pega en el doc de rendimiento. La decisión (qué es fuga, qué cumple) está en
 * `utils/timeLapse.ts`, no aquí: este componente solo pinta.
 *
 * Estética según `docs/GAIA_VISUAL_DESIGN.md`: telemetría en monoespaciada, sobria, sin
 * iconografía. Tailwind aún no está instalado (llega con el HUD de F7), así que el estilo
 * va en línea en vez de inventar una dependencia.
 */
import { useEffect, useRef, useState } from "react";

import {
  WINDOW_FRAMES,
  WINDOW_LONG_TASKS,
  computeStats,
  readMemory,
  summarizeLongTasks,
  type FrameStats,
  type LongTaskStats,
} from "../utils/frameStats";
import {
  DURACION_TIMELAPSE_MS,
  formatearTimeLapse,
  leerMuestra,
  resumirTimeLapse,
  type MuestraMemoria,
} from "../utils/timeLapse";

/** Cuántas veces por segundo se refrescan los números (no en cada frame). */
const REFRESH_MS = 250;

/**
 * Cadencia de la muestra de memoria del time-lapse. Una por segundo son 30 muestras en los
 * 30 s del criterio, que es lo que hace falta para distinguir una tendencia de un pico.
 */
const CADA_MUESTRA_MS = 1000;

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: "8px",
    right: "8px",
    zIndex: 9999,
    padding: "6px 8px",
    background: "rgba(5, 10, 16, 0.78)",
    color: "#c9d6e2",
    border: "1px solid rgba(120, 160, 190, 0.28)",
    borderRadius: "3px",
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
    fontSize: "11px",
    fontWeight: 400,
    lineHeight: 1.5,
    pointerEvents: "none",
    whiteSpace: "pre",
  },
  hint: { opacity: 0.62 },
  // El informe es lo que se pega en el doc de rendimiento: necesita poder seleccionarse.
  informe: { pointerEvents: "auto", userSelect: "text", marginTop: "4px" },
};

export function DevOverlay(): React.JSX.Element | null {
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [longTasks, setLongTasks] = useState<LongTaskStats>({
    tasks: 0,
    worstMs: null,
  });
  const [visible, setVisible] = useState(true);
  const [memoria, setMemoria] = useState(readMemory());
  const [grabando, setGrabando] = useState(false);
  const [informe, setInforme] = useState<string | null>(null);
  const samples = useRef<number[]>([]);
  const loafDurations = useRef<number[]>([]);
  // Series del time-lapse de 1.6.2: los deltas de frame se acumulan tal cual, y la memoria
  // se lee una vez por segundo. Son dos cadencias distintas y por eso dos series.
  const tlDeltas = useRef<number[]>([]);
  const tlMuestras = useRef<MuestraMemoria[]>([]);
  const tlUltimaMuestra = useRef(0);
  const tlFin = useRef(0);

  useEffect(() => {
    let raf = 0;
    let previous = performance.now();
    let lastRefresh = previous;

    // Frames largos atribuidos (ROADMAP 0.7.7). Se observan con
    // `long-animation-frame` (LoAF) y no con `longtask`: medido en este repo, `longtask`
    // no emite ninguna entrada en Chromium headless ni con un bloqueo de 1200 ms
    // (`getEntriesByType('longtask')` = 0), mientras LoAF reporta 182 ms por un bloqueo
    // de 180 ms. `supportedEntryTypes` decide si la API existe: en Firefox y Safari no
    // existe y el overlay se queda en `n/d` en vez de fingir que no hubo bloqueos.
    let observer: PerformanceObserver | null = null;
    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")
    ) {
      observer = new PerformanceObserver((lista) => {
        for (const entry of lista.getEntries()) {
          loafDurations.current.push(entry.duration);
          if (loafDurations.current.length > WINDOW_LONG_TASKS) {
            loafDurations.current.shift();
          }
        }
      });
      observer.observe({ type: "long-animation-frame" });
    }

    const tick = (now: number): void => {
      const delta = now - previous;
      previous = now;
      // El primer delta tras el montaje incluye el arranque: no es un frame.
      if (delta > 0 && delta < 1000) {
        samples.current.push(delta);
        if (samples.current.length > WINDOW_FRAMES) samples.current.shift();
      }
      if (tlFin.current > 0) {
        tlDeltas.current.push(delta);
        if (now >= tlUltimaMuestra.current + CADA_MUESTRA_MS) {
          tlUltimaMuestra.current = now;
          tlMuestras.current.push(leerMuestra(now));
        }
        if (now >= tlFin.current) {
          setInforme(
            formatearTimeLapse(
              resumirTimeLapse(tlDeltas.current, tlMuestras.current),
            ),
          );
          setGrabando(false);
          tlFin.current = 0;
          tlDeltas.current = [];
          tlMuestras.current = [];
        }
      }
      if (now - lastRefresh >= REFRESH_MS) {
        lastRefresh = now;
        setStats(computeStats(samples.current));
        setLongTasks(summarizeLongTasks(loafDurations.current));
        setMemoria(readMemory());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onKey = (event: KeyboardEvent): void => {
      // `d` sola, sin modificadores, para no pisar atajos de otra tecla.
      if (
        event.key === "d" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        setVisible((v) => !v);
      }
      // `t` arranca el time-lapse del criterio de 1.6.2; mientras corre, `t` lo corta y
      // cierra el informe con lo que haya recogido.
      if (
        event.key === "t" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        const ahora = performance.now();
        tlDeltas.current = [];
        tlMuestras.current = [];
        tlUltimaMuestra.current = ahora;
        if (tlFin.current > 0) {
          setInforme(
            formatearTimeLapse(
              resumirTimeLapse(tlDeltas.current, tlMuestras.current),
            ),
          );
          tlFin.current = 0;
          setGrabando(false);
        } else {
          tlFin.current = ahora + DURACION_TIMELAPSE_MS;
          setGrabando(true);
          setInforme(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!visible) return null;
  if (!stats) return null;

  const peor = longTasks.worstMs === null ? "n/d" : `${longTasks.worstMs} ms`;
  const geo = memoria.geometries === null ? "n/d" : String(memoria.geometries);
  const tex = memoria.textures === null ? "n/d" : String(memoria.textures);

  return (
    <div style={styles.overlay} data-testid="dev-overlay" aria-hidden="true">
      {`fps    ${stats.fps.toFixed(1)}\np95    ${stats.p95Ms.toFixed(1)} ms\ndraw   ${stats.drawCalls ?? "n/d"}\ngeo    ${geo}\ntex    ${tex}\nvent   ${stats.frames}\nlframe ${stats.longFrames}\nloaf   ${longTasks.tasks} peor ${peor}`}
      {grabando && (
        <div data-testid="dev-overlay-timelapse">midiendo 30 s…</div>
      )}
      {informe && (
        <div style={styles.informe} data-testid="dev-overlay-informe">
          {informe}
        </div>
      )}
      <div style={styles.hint}>d oculta · t mide 30 s</div>
    </div>
  );
}

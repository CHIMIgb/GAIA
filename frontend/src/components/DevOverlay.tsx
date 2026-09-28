/**
 * Overlay de desarrollo con FPS, p95 de frame y draw calls (ROADMAP 0.7.1).
 *
 * Solo se monta en dev: `App.tsx` lo importa dinámicamente tras `import.meta.env.DEV`,
 * así que en el build de producción la rama es código muerto y Vite la elimina del grafo
 * (criterio: "ocultable en prod"). Con `npm run build` no aparece ningún chunk suyo.
 *
 * Los draw calls leen de una fuente registrada por el render de Three.js cuando exista.
 * Hoy no hay renderer —la escena base es 1.1.1— así que se muestran como `n/d` en vez de
 * inventarse un número.
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
  summarizeLongTasks,
  type FrameStats,
  type LongTaskStats,
} from "../utils/frameStats";

/** Cuántas veces por segundo se refrescan los números (no en cada frame). */
const REFRESH_MS = 250;

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
};

export function DevOverlay(): React.JSX.Element | null {
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [longTasks, setLongTasks] = useState<LongTaskStats>({
    tasks: 0,
    worstMs: null,
  });
  const [visible, setVisible] = useState(true);
  const samples = useRef<number[]>([]);
  const loafDurations = useRef<number[]>([]);

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
      if (now - lastRefresh >= REFRESH_MS) {
        lastRefresh = now;
        setStats(computeStats(samples.current));
        setLongTasks(summarizeLongTasks(loafDurations.current));
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

  return (
    <div style={styles.overlay} data-testid="dev-overlay" aria-hidden="true">
      {`fps    ${stats.fps.toFixed(1)}\np95    ${stats.p95Ms.toFixed(1)} ms\ndraw   ${stats.drawCalls ?? "n/d"}\nvent   ${stats.frames}\nlframe ${stats.longFrames}\nloaf   ${longTasks.tasks} peor ${peor}`}
      <div style={styles.hint}>d oculta</div>
    </div>
  );
}

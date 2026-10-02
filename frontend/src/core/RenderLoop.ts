/**
 * Bucle de render y su pausa con la pestaña oculta (ROADMAP 1.9.5).
 *
 * Es el `requestAnimationFrame` del motor, y nada más: el motor decide qué se hace en cada
 * frame y se lo pasa como callback. Vive aparte por dos razones. La primera es que el
 * criterio del paso se cumple entero aquí —con la pestaña oculta no se pide ningún frame y
 * al mirarla de nuevo se sigue— y así se puede comprobar en jsdom, donde `Engine` no llega
 * porque `WebGLRenderer` necesita WebGL. La segunda es la razón de fondo: los navegadores
 * ya dejan de entregar frames con la pestaña oculta, así que aquí lo que se hace es dejarlo
 * escrito y no depender de ese comportamiento —que tampoco vale en una ventana tapada por
 * otra— dejando el bucle sin ningún frame pendiente en vez de con uno a medio camino.
 *
 * Desde 1.9.7 se baja la frecuencia en idle (4 FPS) para ahorrar CPU cuando no hay input:
 * la cámara sigue girando a velocidad mínima durante el giro de fondo y no hay flicker.
 */

/** Un paso del bucle: lo que se hace en cada frame, con la hora del frame. */
export type FrameHandler = (ahora: number) => void;

/** Frecuencia en idle: 4 FPS, que es lo bastante suave para el giro de fondo y ahorra CPU. */
const IDLE_FPS = 4;
/** Intervalo entre frames en idle, en ms. */
const IDLE_MS = 1000 / IDLE_FPS;

export class RenderLoop {
  private id: number | null = null;
  private idle = false;
  private readonly frame: FrameHandler;

  private readonly alCambiarVisibilidad = (): void => {
    if (document.hidden) this.stop();
    else this.pedirFrame();
  };

  constructor(frame: FrameHandler) {
    this.frame = frame;
  }

  /** Activa/desactiva la reducción de muestreo en reposo (ROADMAP 1.9.7). */
  setIdle(idle: boolean): void {
    if (idle === this.idle) return;
    this.idle = idle;
    if (this.id !== null) {
      if (this.idle) {
        cancelAnimationFrame(this.id);
        this.id = null;
      } else {
        window.clearTimeout(this.id);
        this.id = null;
      }
      this.pedirFrame();
    }
  }

  /** Arranca el bucle y se queda escuchando la visibilidad de la pestaña. */
  start(): void {
    document.addEventListener("visibilitychange", this.alCambiarVisibilidad);
    this.pedirFrame();
  }

  /** Corta el bucle. Idempotente, y el listener sigue puesto: puede volver a arrancar. */
  stop(): void {
    if (this.id === null) return;
    if (this.idle) {
      window.clearTimeout(this.id);
    } else {
      cancelAnimationFrame(this.id);
    }
    this.id = null;
  }

  /** Corta el bucle y suelta el listener. Para un motor que se desmonta de verdad. */
  dispose(): void {
    this.stop();
    document.removeEventListener("visibilitychange", this.alCambiarVisibilidad);
  }

  private pedirFrame(): void {
    if (this.id !== null) return;
    if (this.idle) {
      // En idle se salta el rAF para espaciar: se pide el siguiente frame con un timeout
      // de 250 ms. Eso evita recalcular uniforms y render cada 16 ms mientras no hay input,
      // y sigue entregando el tiempo del frame tal cual (performance.now()).
      this.id = window.setTimeout(() => {
        this.id = null;
        this.frame(performance.now());
        this.pedirFrame();
      }, IDLE_MS);
      return;
    }
    this.id = requestAnimationFrame((ahora) => {
      // El frame ya está en curso, así que no está pendiente: se suelta el id antes de
      // ejecutarlo, o el `pedirFrame()` de abajo se encontraría con el bucle ocupado y no
      // volvería a pedir nada. La escena se quedaría congelada en el primer frame.
      this.id = null;
      this.frame(ahora);
      this.pedirFrame();
    });
  }
}

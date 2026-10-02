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
 * El tiempo del frame es el de `requestAnimationFrame` y se pasa tal cual: en el primer
 * frame de vuelta es la hora de ahora, no la del frame anterior a la pausa, así que la
 * interpolación de la cámara no da un salto de los segundos que estuvo oculta.
 */

/** Un paso del bucle: lo que se hace en cada frame, con la hora del frame. */
export type FrameHandler = (ahora: number) => void;

export class RenderLoop {
  private id = 0;
  private readonly frame: FrameHandler;

  private readonly alCambiarVisibilidad = (): void => {
    if (document.hidden) this.stop();
    else this.pedirFrame();
  };

  constructor(frame: FrameHandler) {
    this.frame = frame;
  }

  /** Arranca el bucle y se queda escuchando la visibilidad de la pestaña. */
  start(): void {
    document.addEventListener("visibilitychange", this.alCambiarVisibilidad);
    this.pedirFrame();
  }

  /** Corta el bucle. Idempotente, y el listener sigue puesto: puede volver a arrancar. */
  stop(): void {
    cancelAnimationFrame(this.id);
    this.id = 0;
  }

  /** Corta el bucle y suelta el listener. Para un motor que se desmonta de verdad. */
  dispose(): void {
    this.stop();
    document.removeEventListener("visibilitychange", this.alCambiarVisibilidad);
  }

  private pedirFrame(): void {
    if (this.id) return;
    this.id = requestAnimationFrame((ahora) => {
      // El frame ya está en curso, así que no está pendiente: se suelta el id antes de
      // ejecutarlo, o el `pedirFrame()` de abajo se encontraría con el bucle ocupado y no
      // volvería a pedir nada. La escena se quedaría congelada en el primer frame.
      this.id = 0;
      this.frame(ahora);
      this.pedirFrame();
    });
  }
}

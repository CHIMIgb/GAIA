/**
 * Resize del lienzo (ROADMAP 1.1.2).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §5.1 le asigna a este archivo escuchar `window.resize`,
 * actualizar el aspect ratio y llevar el `devicePixelRatio` con cap. Se toma el tamaño
 * del propio lienzo y no el de la ventana: hoy el lienzo ocupa la ventana entera, y
 * cuando el HUD deje de hacerlo (F7) leer el nodo sigue siendo lo correcto sin tocar
 * una línea.
 */
import type { PerspectiveCamera, WebGLRenderer } from "three";

/** Lo único que el resizer necesita de un renderer, que es lo que permite probarlo. */
export type RendererAjustable = Pick<
  WebGLRenderer,
  "setSize" | "setPixelRatio"
>;

/** Cap de `devicePixelRatio` (PROJECT_STRUCTURE §5.1): por encima el coste sube y no se ve. */
const PIXEL_RATIO_MAX = 2;

export class Resizer {
  private readonly canvas: HTMLCanvasElement;
  private readonly camara: PerspectiveCamera;
  private readonly renderer: RendererAjustable;
  private pixelRatioAplicado = 0;

  constructor(
    canvas: HTMLCanvasElement,
    camara: PerspectiveCamera,
    renderer: RendererAjustable,
  ) {
    this.canvas = canvas;
    this.camara = camara;
    this.renderer = renderer;

    // El ajuste inicial va aquí y no solo en el listener: sin él, el primer frame sale
    // con la proporción que tuviera el canvas al crearse.
    this.ajustar();
    window.addEventListener("resize", this.ajustar);
  }

  readonly ajustar = (): void => {
    const ancho = this.canvas.clientWidth;
    const alto = this.canvas.clientHeight;
    // El pixel ratio antes que el tamaño: `setPixelRatio` recalcula el buffer por su
    // cuenta y el `setSize` de después manda sobre él.
    this.pixelRatioAplicado = Math.min(
      window.devicePixelRatio,
      PIXEL_RATIO_MAX,
    );
    this.renderer.setPixelRatio(this.pixelRatioAplicado);
    // `false`: el CSS de `index.css` ya pone el lienzo a pantalla completa y no hace
    // falta que Three reescriba el estilo del nodo.
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  };

  /**
   * Vuelve a aplicar el pixel ratio si cambió desde el último ajuste (ROADMAP 1.9.6).
   *
   * El `resize` no basta: al mover la ventana a otra pantalla con distinta densidad —o al
   * hacer zoom el navegador— el tamaño en píxeles CSS no cambia y puede no llegar ningún
   * evento, con lo que el lienzo se queda con el buffer de la densidad anterior. Esto lo
   * llama el bucle en cada frame, que ya está corriendo: comparar un número cuesta nada, y
   * tras la pausa de 1.9.5 el primer frame de vuelta es justo cuando hace falta. Se
   * descarta `matchMedia('(resolution: Xdppx)')` porque obliga a reenganchar el listener
   * en cada cambio para nada.
   */
  readonly comprobarPixelRatio = (): void => {
    const efectivo = Math.min(window.devicePixelRatio, PIXEL_RATIO_MAX);
    if (efectivo !== this.pixelRatioAplicado) this.ajustar();
  };

  dispose(): void {
    window.removeEventListener("resize", this.ajustar);
  }
}

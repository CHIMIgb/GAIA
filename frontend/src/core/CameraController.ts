/**
 * Cámara orbital (ROADMAP 1.1.2).
 *
 * Envoltura de `OrbitControls`: los límites, el comportamiento de giro y la limpieza.
 * Va en su propio archivo porque `docs/GAIA_PROJECT_STRUCTURE.md` §5.1 le asigna esa
 * responsabilidad, no porque el código lo necesite: son veinte líneas sobre una clase de
 * Three. Se separa por el mismo motivo que `Engine` separa construcción y `start()` —
 * que esto se pueda probar en jsdom sin WebGL.
 *
 * Lo que sí fija `VISUAL_DESIGN` §10, y por eso no es un `OrbitControls` con valores por
 * defecto: la inercia suave del drag, la auto-rotación solo tras 30 s de inactividad y a
 * velocidad mínima, y todo eso apagado con `prefers-reduced-motion`. El mínimo de
 * distancia lo pidió el usuario (antes de validar 1.4.1): a 1.4 la cámara nunca se traga
 * la superficie ni se asoma a la cara lejana; el arrastre con el clic derecho (pan) se
 * desactiva por la misma petición. El resto de límites y el margen polar no los fija
 * ningún doc y salen del radio del globo, que es 1 (ROADMAP 1.2.1).
 */
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { Camera } from "three";

/**
 * Radio del globo (1) más un margen pedido por el usuario: a 1.05 la cámara rozaba la
 * superficie y, con el plano cercano a 0.1, se asomaba a la cara lejana (el antípoda,
 * en noche) en vez de a la superficie; a 1.4 el zoom máximo se queda en el terreno.
 */
const DISTANCIA_MINIMA = 1.4;
/** Lejos del todo, con sitio para el halo atmosférico de 1.2.2. */
const DISTANCIA_MAXIMA = 6;
/**
 * Holgura del ángulo polar en radianes (~2,9°).
 *
 * El criterio de 1.1.2 pide esto: en el polo el ángulo polar degenera y la cámara da una
 * voltereta. Con el intervalo abierto dentro de [0, π] nunca se llega al punto degenerado.
 */
const MARGEN_POLAR = 0.05;
/** Factor de amortiguación: la "inercia suave" de VISUAL_DESIGN §10. */
const INERCIA = 0.08;
/** "Auto-rotación solo en idle > 30 s" (VISUAL_DESIGN §10). */
const IDLE_AUTO_ROTATE_MS = 30_000;
/** "A velocidad mínima" (VISUAL_DESIGN §10): el valor por defecto de OrbitControls es 2. */
const VELOCIDAD_AUTO_ROTATE = 0.5;
const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

export class CameraController {
  readonly controles: OrbitControls;

  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor(camara: Camera, canvas: HTMLCanvasElement) {
    const controles = new OrbitControls(camara, canvas);
    controles.minDistance = DISTANCIA_MINIMA;
    controles.maxDistance = DISTANCIA_MAXIMA;
    controles.minPolarAngle = MARGEN_POLAR;
    controles.maxPolarAngle = Math.PI - MARGEN_POLAR;
    controles.dampingFactor = INERCIA;
    controles.autoRotateSpeed = VELOCIDAD_AUTO_ROTATE;
    // Pedido del usuario antes de validar 1.4.1: sin arrastre con el clic derecho
    // (el pan de OrbitControls) — el planeta solo se rota, no se arrastra.
    controles.mouseButtons.RIGHT = null;

    // Con movimiento reducido no se registra ni el temporizador: sin eventos a los que
    // escuchar, no hay nada que pueda volver a encender la auto-rotación.
    const reducido = window.matchMedia(CONSULTA_MOVIMIENTO).matches;
    controles.enableDamping = !reducido;
    this.controles = controles;

    if (!reducido) {
      controles.addEventListener("start", this.alAgarrar);
      controles.addEventListener("end", this.alSoltar);
      // Abrir la página y no tocarla también es estar inactivo. Sin esta llamada, el giro
      // de fondo solo llegaría después del primer drag.
      this.alSoltar();
    }
  }

  /** Se llama en cada frame: sin esto ni la inercia ni la auto-rotación avanzan. */
  update(): void {
    this.controles.update();
  }

  private readonly alAgarrar = (): void => {
    this.controles.autoRotate = false;
    clearTimeout(this.temporizador);
  };

  private readonly alSoltar = (): void => {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.controles.autoRotate = true;
    }, IDLE_AUTO_ROTATE_MS);
  };

  /** Sin esto, la vista desmontada por React seguiría respondiendo al ratón. */
  dispose(): void {
    clearTimeout(this.temporizador);
    this.controles.removeEventListener("start", this.alAgarrar);
    this.controles.removeEventListener("end", this.alSoltar);
    this.controles.dispose();
  }
}

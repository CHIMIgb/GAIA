/**
 * Cámara orbital (ROADMAP 1.1.2).
 *
 * Envoltura de `TrackballControls`: los límites, el comportamiento de giro y la limpieza.
 * Va en su propio archivo porque `docs/GAIA_PROJECT_STRUCTURE.md` §5.1 le asigna esa
 * responsabilidad, no porque el código lo necesite: son veinte líneas sobre una clase de
 * Three. Se separa por el mismo motivo que `Engine` separa construcción y `start()` —
 * que esto se pueda probar en jsdom sin WebGL.
 *
 * *Por qué `TrackballControls` y no `OrbitControls`* (cambio pedido por el usuario): el
 * `OrbitControls` clampea el ángulo polar a [0, π] (el `Spherical.makeSafe()` que corre
 * en su `update()`) y el arrastre vertical se atascaba en los polos —el criterio de
 * 1.1.2 lo frenaba a ±0.05 rad para no dar la voltereta—. `TrackballControls` rota por
 * cuaterniones (arcball): no hay ángulo polar que clampar, así que la cámara cruza por
 * encima y por debajo del globo sin polos ni voltereta, y el horizonte rota de forma
 * continua (no mantiene un "arriba" fijo, que era la causa del bloqueo).
 *
 * Lo que sí fija `VISUAL_DESIGN` §10, y por eso no son valores por defecto: la inercia
 * suave del drag, la auto-rotación solo tras 30 s de inactividad y a velocidad mínima, y
 * todo eso apagado con `prefers-reduced-motion`. El mínimo de distancia lo pidió el
 * usuario (antes de validar 1.4.1): a 1.4 la cámara nunca se traga la superficie ni se
 * asoma a la cara lejana; el arrastre con el clic derecho (pan) se desactiva por la misma
 * petición. El resto de límites no los fija ningún doc y salen del radio del globo, que es
 * 1 (ROADMAP 1.2.1).
 */
import { Vector3 } from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import type { Camera } from "three";

/**
 * Radio del globo (1) más un margen pedido por el usuario: a 1.05 la cámara rozaba la
 * superficie y, con el plano cercano a 0.1, se asomaba a la cara lejana (el antípoda,
 * en noche) en vez de a la superficie; a 1.4 el zoom máximo se queda en el terreno.
 */
const DISTANCIA_MINIMA = 1.4;
/** Lejos del todo, con sitio para el halo atmosférico de 1.2.2. */
const DISTANCIA_MAXIMA = 6;
/** "Auto-rotación solo en idle > 30 s" (VISUAL_DESIGN §10). */
const IDLE_AUTO_ROTATE_MS = 30_000;
/**
 * "A velocidad mínima" (VISUAL_DESIGN §10): el ritmo del `autoRotate` de `OrbitControls`
 * a 0.5, que es lo que llevaba 1.1.2 (≈3°/s). Por frame a 60 FPS, que es como el motor
 * llama a `update()`.
 */
const RAD_POR_SEGUNDO_FONDO = ((2 * Math.PI) / 60) * 0.5;
const PASO_FONDO = RAD_POR_SEGUNDO_FONDO / 60;
/** El eje del planeta: hacia arriba, lo único que no se toca al girar de fondo. */
const EJE_Y = new Vector3(0, 1, 0);
const CONSULTA_MOVIMIENTO = "(prefers-reduced-motion: reduce)";

export class CameraController {
  readonly controles: TrackballControls;

  /**
   * Giro de fondo de `VISUAL_DESIGN` §10: tras 30 s sin tocar nada, la cámara orbita el
   * globo despacio. `TrackballControls` no trae `autoRotate` (three lo quitó en el
   * refactor de controles de r150+), así que el giro se aplica en `update()`: la cámara
   * rota alrededor del eje del planeta al mismo ritmo que el antiguo `autoRotate` a 0.5.
   */
  giraEnFondo = false;

  private temporizador: ReturnType<typeof setTimeout> | undefined;

  constructor(camara: Camera, canvas: HTMLCanvasElement) {
    const controles = new TrackballControls(camara, canvas);
    controles.minDistance = DISTANCIA_MINIMA;
    controles.maxDistance = DISTANCIA_MAXIMA;
    // Pedido del usuario antes de validar 1.4.1: sin arrastre con el clic derecho
    // (el pan de TrackballControls) — el planeta solo se rota, no se arrastra.
    controles.mouseButtons.RIGHT = null;

    // Con movimiento reducido no se registra ni el temporizador: sin eventos a los que
    // escuchar, no hay nada que pueda volver a encender el giro de fondo. La inercia en
    // TrackballControls se corta con `staticMoving = true` (no hay `enableDamping`).
    const reducido = window.matchMedia(CONSULTA_MOVIMIENTO).matches;
    controles.staticMoving = reducido;
    this.controles = controles;

    if (!reducido) {
      controles.addEventListener("start", this.alAgarrar);
      controles.addEventListener("end", this.alSoltar);
      // Abrir la página y no tocarla también es estar inactivo. Sin esta llamada, el giro
      // de fondo solo llegaría después del primer drag.
      this.alSoltar();
    }
  }

  /** Se llama en cada frame: sin esto ni la inercia ni el giro de fondo avanzan. */
  update(): void {
    this.controles.update();

    if (this.giraEnFondo) {
      const { object, target } = this.controles;
      object.position.sub(target).applyAxisAngle(EJE_Y, PASO_FONDO).add(target);
      object.lookAt(target);
    }
  }

  private readonly alAgarrar = (): void => {
    this.giraEnFondo = false;
    clearTimeout(this.temporizador);
  };

  private readonly alSoltar = (): void => {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => {
      this.giraEnFondo = true;
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

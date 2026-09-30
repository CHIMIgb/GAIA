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
 * todo eso apagado con `prefers-reduced-motion`. El mínimo de distancia y el zoom por
 * defecto los pidió el usuario, igual que desactivar el arrastre con el clic derecho (pan):
 * la cámara nunca se traga la superficie ni se asoma a la cara lejana. El resto de límites
 * no los fija ningún doc y salen del radio del globo, que es 1 (ROADMAP 1.2.1).
 */
import { Vector3 } from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import type { Camera } from "three";

/**
 * Radio del globo (ROADMAP 1.2.1): es el suelo de la cámara y el cero de la sensibilidad.
 */
const RADIO_GLOBO = 1;

/**
 * Límite de acercamiento, pedido del usuario: con la superficie a `d − 1` y el plano
 * cercano a 0.1, bajar de 1.1 recortaba el punto del globo justo bajo la cámara y se
 * asomaba la cara lejana (el antípoda) en vez de a la superficie —de ahí que 1.05 quedara
 * descartado—. A 1.25 quedan 0.25 de margen y además es donde el atlas de vista alcanza
 * z8: más cerca se cubre menos pantalla y el rectángulo del cap entra en el techo de
 * 6144 px (con tiles de 256 px).
 */
const DISTANCIA_MINIMA = 1.25;
/** Lejos del todo, con sitio para el halo atmosférico de 1.2.2. */
const DISTANCIA_MAXIMA = 6;
/**
 * Zoom por defecto (el `position.set` de `Engine`): dos radios. El campo de visión es de
 * 45°, así que el globo entra a media pantalla, y es el nivel z2 de la escalera de textura
 * —uno de los tres que `precargar()` deja listos en segundo plano—.
 */
export const DISTANCIA_POR_DEFECTO = 2;
/**
 * Velocidad del arrastre, sobre el 1.0 por defecto de `TrackballControls`: el usuario
 * pidió "más sensibilidad" al girar. Es la única rueda de ajuste de este archivo —si
 *arece nerviosa, se toca aquí y nada más—.
 */
const VELOCIDAD_ROTACION = 1.8;
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

/**
 * `TrackballControls` con los dos ejes a la misma sensibilidad (pedido del usuario).
 *
 * El arcball normaliza cada eje por la mitad de su dimensión (`screen.width/2` para el
 * horizontal, `screen.height/2` para el vertical), así que en un lienzo apaisado el
 * arrastre vertical gira bastante más que el horizontal: a 1280×720 el horizontal va a
 * 0.56 del vertical. Igualando los dos denominadores al lado corto —el alto en un lienzo
 * apaisado— las sensibilidades coinciden y, de paso, el arrastre horizontal deja de ir a
 * la mitad. Solo cambia dónde se midió el arrastre: ni la cámara, ni el zoom, ni el giro
 * de fondo se ven afectados.
 */
class ControlesSimetricos extends TrackballControls {
  override handleResize(): void {
    super.handleResize();
    const lado = Math.min(this.screen.width, this.screen.height);
    this.screen.width = lado;
    this.screen.height = lado;
  }
}

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
    const controles = new ControlesSimetricos(camara, canvas);
    controles.minDistance = DISTANCIA_MINIMA;
    controles.maxDistance = DISTANCIA_MAXIMA;
    controles.rotateSpeed = VELOCIDAD_ROTACION;
    // Pedido del usuario antes de validar 1.4.1: sin arrastre con el clic derecho
    // (el pan de TrackballControls) — el planeta solo se rota, no se arrastra.
    controles.mouseButtons.RIGHT = null;

    // Con movimiento reducido no se registra ni el temporizador: sin eventos a los que
    // escuchar, no hay nada que pueda volver a encender el giro de fondo. La inercia en
    // TrackballControls se corta con `staticMoving = true` (no hay `enableDamping`).
    const reducido = window.matchMedia(CONSULTA_MOVIMIENTO).matches;
    controles.staticMoving = reducido;
    this.controles = controles;

    // Ni `TrackballControls` ni `OrbitControls` escuchan `resize` (su `handleResize()`
    // solo corre en el constructor), así que sin esto el arrastre se mediría contra el
    // tamaño viejo del lienzo en cuanto cambia la ventana. El `Resizer` ya escucha el
    // mismo evento para el aspect ratio; son dos consumidores legítimos del mismo resize.
    window.addEventListener("resize", this.alRedimensionar);

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
    this.controles.rotateSpeed = this.velocidadDeArrastre();
    this.controles.update();

    if (this.giraEnFondo) {
      const { object, target } = this.controles;
      object.position.sub(target).applyAxisAngle(EJE_Y, PASO_FONDO).add(target);
      object.lookAt(target);
    }
  }

  private readonly alRedimensionar = (): void => {
    this.controles.handleResize();
  };

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

  /**
   * La sensibilidad del arrastre baja conforme se hace zoom (pedido del usuario): el factor
   * va con la altura sobre la superficie —`d − 1` radios— medido contra el zoom por defecto
   * (2 radios). Así la vista de arranque gira igual de rápido que siempre, en el contacto el
   * giro sale fino para colocar el punto que sea, y de lejos se puede girar el planeta
   * entero de un tirón. Los topes son los que mantienen eso honesto: a 6 radios el factor
   * sería 5 (velocidad absurda) y con un suelo más cercano que el actual el arrastre se
   * pararía del todo en vez de afinarse.
   */
  private velocidadDeArrastre(): number {
    const { object, target } = this.controles;
    const altura = object.position.distanceTo(target) - RADIO_GLOBO;
    const factor = altura / (DISTANCIA_POR_DEFECTO - RADIO_GLOBO);
    return VELOCIDAD_ROTACION * Math.min(Math.max(factor, 0.2), 2);
  }

  /** Sin esto, la vista desmontada por React seguiría respondiendo al ratón. */
  dispose(): void {
    clearTimeout(this.temporizador);
    window.removeEventListener("resize", this.alRedimensionar);
    this.controles.removeEventListener("start", this.alAgarrar);
    this.controles.removeEventListener("end", this.alSoltar);
    this.controles.dispose();
  }
}

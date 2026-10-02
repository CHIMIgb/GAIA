/**
 * Motor de renderizado Three.js (ROADMAP 1.1.1 — escena, cámara, luz y bucle;
 * 1.1.2 — cámara orbital y resize; 1.2.1 — geoide; 1.5.1 — doble clic a coordenada;
 * 1.9.5 — el bucle se para con la pestaña oculta).
 *
 * El constructor monta el grafo de escena, que es solo Three.js y se puede probar sin
 * navegador. `start()` pide el contexto WebGL y arranca el bucle: es el punto donde la
 * escena deja de ser una estructura de datos. Esa separación es la que permite que
 * `tests/core/Engine.spec.ts` compruebe el grafo en jsdom, donde no hay WebGL.
 *
 * La cámara orbital (`CameraController`) y el resize (`Resizer`) se crean en `start()` y
 * no en el constructor por lo mismo: los dos necesitan un nodo del DOM con medidas. El
 * motor solo engancha gestos a la cámara —desde 1.5.1, el doble clic— y le pasa la malla
 * del globo: la lógica del gesto es de la cámara, no de aquí.
 *
 * Ubicación según `docs/GAIA_PROJECT_STRUCTURE.md` §1 (`core/`). El cubo de andamiaje de
 * 1.1.1 se retiró en 1.2.1, cuando el geoide lo sustituyó.
 */
import {
  AmbientLight,
  Color,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

import { GlobeModule } from "../modules/globe/GlobeModule";
import { registerDrawCallsSource } from "../utils/frameStats";

import {
  altoDelLienzo,
  CameraController,
  distanciaDeEncuadre,
  FOV_CAMARA,
} from "./CameraController";
import { RenderLoop } from "./RenderLoop";
import { Resizer } from "./Resizer";

/** `--gaia-bg` de GAIA_VISUAL_DESIGN §5.1. */
const FONDO_ESPACIO = 0x05070b;

export class Engine {
  readonly escena: Scene;
  readonly camara: PerspectiveCamera;
  /** El globo terráqueo. El motor lo monta pero no lo toca: quien lo gobierna es el módulo. */
  readonly globo: GlobeModule;

  private readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | null = null;
  private camaraCtrl: CameraController | null = null;
  private resizer: Resizer | null = null;
  private bucle: RenderLoop | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.escena = new Scene();
    this.escena.background = new Color(FONDO_ESPACIO);

    this.camara = new PerspectiveCamera(FOV_CAMARA, 1, 0.1, 100);
    // Encuadre de arranque: el planeta entero con hueco, deducido del alto del lienzo. Lo
    // aplica ya el constructor para que ningún test ni el primer frame vean la cámara
    // dentro del globo; `CameraController` lo recalcula al montarse y en cada resize
    // mientras el usuario no haya tocado la cámara.
    this.camara.position.set(0, 0, distanciaDeEncuadre(altoDelLienzo(canvas)));

    this.escena.add(new AmbientLight(0xffffff, 0.8));
    // Desde 1.2.2 la `DirectionalLight` sobra: el `ShaderMaterial` de la atmósfera no lee
    // luces — la iluminación (hoy uniforme, sin día/noche, por pedido del usuario) y el
    // brillo del limbo los calcula él.
    //
    // La ambiental se queda: el `ShaderMaterial` no lee luces, así que sin ella lo que
    // use el material estandar de Three se quedaría negro. El globo ya no depende de
    // ninguna luz.
    this.escena.add(new AmbientLight(0xffffff, 0.8));

    this.globo = new GlobeModule(this.escena);
  }

  /** Pide el contexto WebGL, dimensiona el lienzo y empieza a renderizar. */
  start(): void {
    if (this.renderer) return;

    const renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer = renderer;

    // El overlay de dev ya sabía leer draw calls de una fuente registrada (0.7.1) y la
    // tenía en `n/d` a la espera de este paso. Sin esto, el contador nunca sale de `n/d`.
    registerDrawCallsSource(renderer);

    this.camaraCtrl = new CameraController(this.camara, this.canvas);
    // 1.5.1: el doble clic acerca y centra la cámara en el punto del globo que hay bajo el
    // cursor. El raycast va contra la malla del geoide, así que el gesto funciona con el
    // globo sin textura; el controlador es quien guarda la regla y el vuelo.
    this.camaraCtrl.apuntarConDobleClic(this.globo.malla);
    // El resizer encaja el lienzo al construirse, así que sustituye al ajuste inicial que
    // hacía el motor en 1.1.1.
    this.resizer = new Resizer(this.canvas, this.camara, renderer);

    // El bucle es el de 1.9.5, que además corta los frames con la pestaña oculta y los
    // retoma al mirarla; lo que se hace en cada frame sigue siendo esto.
    this.bucle = new RenderLoop((ahora) => {
      // Sin este `update()` ni la inercia ni el giro de fondo avanzan: es lo que hace
      // `TrackballControls` en cada frame (PROJECT_STRUCTURE §5.1). El tiempo del frame es
      // el que mide el vuelo de acercamiento de 1.5.1.
      this.camaraCtrl?.update(ahora);
      renderer.render(this.escena, this.camara);
    });
    this.bucle.start();
  }

  /** Cancela el bucle y libera GPU y memoria. Sin esto, remontar la vista filtra. */
  dispose(): void {
    this.bucle?.dispose();
    this.bucle = null;
    registerDrawCallsSource(null);
    this.resizer?.dispose();
    this.camaraCtrl?.dispose();
    this.resizer = null;
    this.camaraCtrl = null;
    this.globo.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

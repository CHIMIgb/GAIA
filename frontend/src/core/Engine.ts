/**
 * Motor de renderizado Three.js (ROADMAP 1.1.1 — escena, cámara, luz y bucle;
 * 1.1.2 — cámara orbital y resize; 1.2.1 — geoide).
 *
 * El constructor monta el grafo de escena, que es solo Three.js y se puede probar sin
 * navegador. `start()` pide el contexto WebGL y arranca el bucle: es el punto donde la
 * escena deja de ser una estructura de datos. Esa separación es la que permite que
 * `tests/core/Engine.spec.ts` compruebe el grafo en jsdom, donde no hay WebGL.
 *
 * La cámara orbital (`CameraController`) y el resize (`Resizer`) se crean en `start()` y
 * no en el constructor por lo mismo: los dos necesitan un nodo del DOM con medidas.
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

import { CameraController } from "./CameraController";
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
  private frame = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.escena = new Scene();
    this.escena.background = new Color(FONDO_ESPACIO);

    this.camara = new PerspectiveCamera(45, 1, 0.1, 100);
    // A 4 radios se ve el planeta entero con hueco de sobra: el campo de visión es de 45°
    // y desde ahí el globo ocupa unos dos tercios del alto.
    this.camara.position.set(0, 0, 4);

    this.escena.add(new AmbientLight(0xffffff, 0.8));
    // Desde 1.2.2 la `DirectionalLight` sobra: el terminator y el lado noche los calcula
    // el `ShaderMaterial` de la atmósfera con su uniform `solDireccion`, en la misma
    // dirección `(2, 3, 4)`. Con las dos cosas el terminador se dibujaba dos veces —una
    // por la luz y otra por el shader— y no se podía quitar la direccional sin ver antes
    // a qué parte del globo oscurecía.
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
    // El resizer encaja el lienzo al construirse, así que sustituye al ajuste inicial que
    // hacía el motor en 1.1.1.
    this.resizer = new Resizer(this.canvas, this.camara, renderer);

    const paso = (): void => {
      // Sin este `update()` ni la inercia del drag ni el giro de fondo avanzan: es lo que
      // hace `OrbitControls` en cada frame (PROJECT_STRUCTURE §5.1).
      this.camaraCtrl?.update();
      renderer.render(this.escena, this.camara);
      this.frame = requestAnimationFrame(paso);
    };
    this.frame = requestAnimationFrame(paso);
  }

  /** Cancela el bucle y libera GPU y memoria. Sin esto, remontar la vista filtra. */
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
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

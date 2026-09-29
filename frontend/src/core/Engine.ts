/**
 * Motor de renderizado Three.js (ROADMAP 1.1.1 — escena, cámara, luz y bucle;
 * 1.1.2 — cámara orbital y resize).
 *
 * El constructor monta el grafo de escena, que es solo Three.js y se puede probar sin
 * navegador. `start()` pide el contexto WebGL y arranca el bucle: es el punto donde la
 * escena deja de ser una estructura de datos. Esa separación es la que permite que
 * `tests/core/Engine.spec.ts` compruebe el grafo en jsdom, donde no hay WebGL.
 *
 * La cámara orbital (`CameraController`) y el resize (`Resizer`) se crean en `start()` y
 * no en el constructor por lo mismo: los dos necesitan un nodo del DOM con medidas.
 *
 * Ubicación según `docs/GAIA_PROJECT_STRUCTURE.md` §1 (`core/`). El cubo de referencia es
 * andamiaje de 1.1.1: la esfera real entra en 1.2.1.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

import { registerDrawCallsSource } from "../utils/frameStats";

import { CameraController } from "./CameraController";
import { Resizer } from "./Resizer";

/** `--gaia-bg` de GAIA_VISUAL_DESIGN §5.1. */
const FONDO_ESPACIO = 0x05070b;
/** `--gaia-accent` de GAIA_VISUAL_DESIGN §5.1: el único acento del sistema. */
const ACENTO = 0x3fd8c9;

export class Engine {
  readonly escena: Scene;
  readonly camara: PerspectiveCamera;
  readonly referencia: Mesh;

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
    this.camara.position.set(0, 0, 4);

    this.escena.add(new AmbientLight(0xffffff, 0.8));
    // La direccional no está en el criterio de este paso, pero sin ella el cubo sale
    // plano: la luz ambiente reparte la misma intensidad a todas las caras y no se ve
    // que es un cubo. Una línea para que la referencia sirva de referencia.
    const clave = new DirectionalLight(0xffffff, 0.6);
    clave.position.set(2, 3, 4);
    this.escena.add(clave);

    this.referencia = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ color: ACENTO }),
    );
    this.escena.add(this.referencia);
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

    const paso = (marca: number): void => {
      this.referencia.rotation.y = marca * 0.0006;
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
    this.referencia.geometry.dispose();
    (this.referencia.material as MeshStandardMaterial).dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

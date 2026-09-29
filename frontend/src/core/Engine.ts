/**
 * Motor de renderizado Three.js (ROADMAP 1.1.1 — escena, cámara, luz y bucle).
 *
 * El constructor monta el grafo de escena, que es solo Three.js y se puede probar sin
 * navegador. `start()` pide el contexto WebGL y arranca el bucle: es el punto donde la
 * escena deja de ser una estructura de datos. Esa separación es la que permite que
 * `tests/core/Engine.spec.ts` compruebe el grafo en jsdom, donde no hay WebGL.
 *
 * Ubicación según `docs/GAIA_PROJECT_STRUCTURE.md` §1 (`core/`). El cubo de referencia es
 * andamiaje de este paso: la esfera real entra en 1.2.1.
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

/** `--gaia-bg` de GAIA_VISUAL_DESIGN §5.1. */
const FONDO_ESPACIO = 0x05070b;
/** `--gaia-accent` de GAIA_VISUAL_DESIGN §5.1: el único acento del sistema. */
const ACENTO = 0x3fd8c9;
/** Tope del ratio de píxeles: por encima el coste de GPU crece y no se ve. */
const PIXEL_RATIO_MAX = 2;

export class Engine {
  readonly escena: Scene;
  readonly camara: PerspectiveCamera;
  readonly referencia: Mesh;

  private readonly canvas: HTMLCanvasElement;
  private renderer: WebGLRenderer | null = null;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_MAX));
    this.encajar();
    this.renderer = renderer;

    // El overlay de dev ya sabía leer draw calls de una fuente registrada (0.7.1) y la
    // tenía en `n/d` a la espera de este paso. Sin esto, el contador nunca sale de `n/d`.
    registerDrawCallsSource(renderer);

    const paso = (marca: number): void => {
      this.referencia.rotation.y = marca * 0.0006;
      renderer.render(this.escena, this.camara);
      this.frame = requestAnimationFrame(paso);
    };
    this.frame = requestAnimationFrame(paso);
  }

  /**
   * Ajusta el lienzo y el aspect ratio al tamaño de su contenedor.
   *
   * El listener de `resize` llega con 1.1.2 junto a la cámara orbital; aquí solo el
   * dimensionado inicial, sin el que el primer frame sale escalado.
   */
  encajar(): void {
    if (!this.renderer) return;
    const ancho = this.canvas.clientWidth;
    const alto = this.canvas.clientHeight;
    this.renderer.setSize(ancho, alto, false);
    this.camara.aspect = ancho / alto;
    this.camara.updateProjectionMatrix();
  }

  /** Cancela el bucle y libera GPU y memoria. Sin esto, remontar la vista filtra. */
  dispose(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    registerDrawCallsSource(null);
    this.referencia.geometry.dispose();
    (this.referencia.material as MeshStandardMaterial).dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

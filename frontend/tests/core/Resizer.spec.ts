/**
 * Resize del lienzo (ROADMAP 1.1.2).
 *
 * El redimensionado es DOM puro —un listener de `window.resize` y cuatro líneas— pero es
 * el origen de la mitad de los fallos de una escena 3D: si el aspect ratio no se recalcula
 * al arrastrar la ventana, el globo sale estirado. Se prueba con un renderer falso porque
 * `WebGLRenderer` necesita WebGL y jsdom no lo tiene; la cámara sí es real, que en jsdom
 * funciona y no cuesta fingirla.
 */
import { PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Resizer, type RendererAjustable } from "../../src/core/Resizer";

/** Solo `setSize` y `setPixelRatio`: el resizer no toca nada más del renderer. */
const rendererFalso = () =>
  ({
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
  }) as unknown as RendererAjustable;

/** jsdom no calcula layout, así que `clientWidth` sale siempre en 0 y hay que fijarlo. */
const lienzo = (ancho: number, alto: number): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  let w = ancho;
  let h = alto;
  // `configurable` para que `redimensionar` pueda volver a redefinir el getter.
  Object.defineProperty(canvas, "clientWidth", {
    get: () => w,
    configurable: true,
  });
  Object.defineProperty(canvas, "clientHeight", {
    get: () => h,
    configurable: true,
  });
  return canvas;
};

/** Cambia el tamaño que verá el resizer en la siguiente lectura. */
const redimensionar = (
  canvas: HTMLCanvasElement,
  ancho: number,
  alto: number,
): void => {
  vi.spyOn(canvas, "clientWidth", "get").mockReturnValue(ancho);
  vi.spyOn(canvas, "clientHeight", "get").mockReturnValue(alto);
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Resizer — resize del lienzo (ROADMAP 1.1.2)", () => {
  it("encaja el lienzo y el aspect ratio al construirse", () => {
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    const renderer = rendererFalso();

    new Resizer(lienzo(1024, 768), camara, renderer);

    // El ajuste inicial importa tanto como el listener: sin él el primer frame sale con
    // la proporción de la creación del canvas, no con la del hueco que ocupa.
    expect(renderer.setSize).toHaveBeenCalledWith(1024, 768, false);
    expect(camara.aspect).toBeCloseTo(1024 / 768, 10);
  });

  it("recalcula al cambiar el tamaño de la ventana", () => {
    const canvas = lienzo(800, 600);
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    const renderer = rendererFalso();
    new Resizer(canvas, camara, renderer);

    redimensionar(canvas, 600, 900);
    window.dispatchEvent(new Event("resize"));

    expect(renderer.setSize).toHaveBeenLastCalledWith(600, 900, false);
    expect(camara.aspect).toBeCloseTo(600 / 900, 10);
  });

  it("nunca deja el pixel ratio por encima de 2", () => {
    const renderer = rendererFalso();
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);

    new Resizer(lienzo(800, 600), new PerspectiveCamera(), renderer);

    // PROJECT_STRUCTURE §5.1 fija el cap en 2.0: por encima se multiplica el coste de GPU
    // sin que el resultado se distinga en una pantalla normal.
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(2);
  });

  it("deja de escuchar al destruirse", () => {
    const espia = vi.spyOn(window, "removeEventListener");

    new Resizer(
      lienzo(800, 600),
      new PerspectiveCamera(),
      rendererFalso(),
    ).dispose();

    expect(espia).toHaveBeenCalled();
  });
});

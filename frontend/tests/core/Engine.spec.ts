/**
 * Escena base del motor Three.js (ROADMAP 1.1.1).
 *
 * Se prueba la construcción de la escena, no el render: `WebGLRenderer` necesita un
 * contexto WebGL real y en jsdom no existe. El contexto se pide en `start()`, que es
 * justo lo que separa este test de un navegador de verdad. Lo que sí es de este paso —el
 * fondo, la cámara, la luz y el cubo de referencia— se comprueba aquí; que se vea en
 * pantalla lo comprueba `tests/fps/fps.spec.ts` sobre el build de producción.
 */
import {
  AmbientLight,
  BoxGeometry,
  Color,
  Mesh,
  PerspectiveCamera,
} from "three";
import { describe, expect, it } from "vitest";

import { Engine } from "../../src/core/Engine";

const nuevo = () => new Engine(document.createElement("canvas"));

describe("Engine — escena base (ROADMAP 1.1.1)", () => {
  it("pone el fondo del espacio detrás del lienzo", () => {
    // `--gaia-bg` de GAIA_VISUAL_DESIGN §5.1: "Fondo del espacio, detrás del lienzo
    // WebGL". Un espacio negro pelado se vería en los bordes al redimensionar.
    const fondo = nuevo().escena.background;

    expect(fondo).toBeInstanceOf(Color);
    expect((fondo as Color).getHexString()).toBe("05070b");
  });

  it("prepara una cámara en perspectiva fuera del origen, mirándolo", () => {
    const { camara } = nuevo();

    expect(camara).toBeInstanceOf(PerspectiveCamera);
    // Dentro de la esfera no hay nada que renderizar; a 4 radios se ve el cubo entero.
    expect(camara.position.length()).toBeGreaterThan(1);
  });

  it("añade la luz ambiental y el cubo de referencia a la escena", () => {
    const { escena, referencia } = nuevo();

    expect(escena.children).toContain(referencia);
    expect(referencia).toBeInstanceOf(Mesh);
    expect(referencia.geometry).toBeInstanceOf(BoxGeometry);
    expect(escena.children.some((hijo) => hijo instanceof AmbientLight)).toBe(
      true,
    );
  });
});

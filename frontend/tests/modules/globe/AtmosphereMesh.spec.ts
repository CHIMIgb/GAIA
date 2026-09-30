/**
 * Atmósfera (ROADMAP 1.2.2, ajustada por el usuario antes de validar 1.4.1).
 *
 * El pedido del usuario fue quitar el día/noche —"que siempre se vea de forma clara
 * cualquier parte del planeta"— y mantener el brillo sutil del limbo. Así que aquí se
 * comprueba lo que queda comprobable sin mirar una captura: que el shader ya no depende
 * de ninguna dirección de sol (no hay `solDireccion` ni `ladoNoche`), que los parámetros
 * ajustables del criterio se cambian sin reconstruir el material, y que el default del
 * resplandor del limbo es el acento de `GAIA_VISUAL_DESIGN.md` §5.1 con opacidad baja
 * (§4: "no un halo de neón").
 *
 * Que el resplandor *se vea* en el limbo es visual, y lo comprueba el navegador en la
 * verificación de 1.4.1.
 */
import { Color, Scene } from "three";
import { describe, expect, it } from "vitest";

import { AtmosphereMesh } from "../../../src/modules/globe/AtmosphereMesh";

const uniforme = (
  malla: { material: { uniforms: Record<string, { value: unknown }> } },
  n: string,
) => malla.material.uniforms[n].value;

describe("AtmosphereMesh — atmósfera iluminación uniforme (1.2.2 ajustado)", () => {
  it("no hay día/noche: el shader no tiene sol ni lado noche", () => {
    const { malla, material } = new AtmosphereMesh();

    // El usuario pidió que el planeta se vea siempre claro: sin dirección de sol ni
    // factor de noche en uniforms ni en el código del shader.
    expect(malla.material.uniforms.solDireccion).toBeUndefined();
    expect(malla.material.uniforms.ladoNoche).toBeUndefined();
    expect(material.fragmentShader).not.toContain("solDireccion");
    expect(material.fragmentShader).not.toContain("ladoNoche");
  });

  it("los parámetros del criterio se ajustan sin reconstruir el material", () => {
    const atmo = new AtmosphereMesh();
    const material = atmo.material;

    atmo.parametros = {
      intensidad: 0.8,
      exponente: 5,
      color: 0xff0000,
    };

    expect(uniforme(atmo.malla, "intensidadBorde")).toBe(0.8);
    expect(uniforme(atmo.malla, "exponenteBorde")).toBe(5);
    expect((uniforme(atmo.malla, "colorAcento") as Color).getHex()).toBe(
      0xff0000,
    );
    // Ajustar no puede crear un material nuevo: el shader compila una vez.
    expect(atmo.material).toBe(material);
  });

  it("el resplandor del limbo es sutil, no un halo de neón", () => {
    const { malla } = new AtmosphereMesh();

    // VISUAL_DESIGN §4: "opacidad baja (no un halo de neón)" y §5.1 el único acento es
    // `--gaia-accent`. Los dos valores concretos no los fija ningún doc, así que la
    // condición es la del doc: bajo, y del color del acento.
    expect(uniforme(malla, "intensidadBorde") as number).toBeLessThan(0.5);
    expect((uniforme(malla, "colorAcento") as Color).getHex()).toBe(0x3fd8c9);
  });

  it("la superficie sale siempre iluminada, sin multiplicador de noche", () => {
    const { material } = new AtmosphereMesh();
    const fs = material.fragmentShader;

    // El fragment output es la textura (o color base) + el brillo del limbo: nada de
    // `mix(base * noche, base, luz)`.
    expect(fs).toContain("cameraPosition");
    expect(fs).toContain("vNormalMundo");
    expect(fs).toContain("vPosicionMundo");
    expect(fs).not.toContain("mix(superficie");
    expect(fs).not.toContain("smoothstep");
  });

  it("al destruirse suelta geometría y material", () => {
    const escena = new Scene();
    const atmo = new AtmosphereMesh();
    escena.add(atmo.malla);

    const material = atmo.material;
    let tirado = false;
    material.dispose = () => {
      tirado = true;
    };

    atmo.dispose();

    expect(tirado).toBe(true);
  });
});

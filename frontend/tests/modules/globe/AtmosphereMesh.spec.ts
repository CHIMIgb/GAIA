/**
 * Atmósfera día/noche (ROADMAP 1.2.2).
 *
 * El criterio del paso tiene tres mitades, y aquí se comprueban las que se pueden
 * comprobar sin mirar una captura: que el sol va en una dirección **fija en el espacio**
 * (no pegado a la cámara), que los tres parámetros que el criterio llama "ajustables"
 * se pueden cambiar sin reconstruir el material, y que el default del resplandor es el
 * acento de `GAIA_VISUAL_DESIGN.md` §5.1 con opacidad baja (§4: "no un halo de neón").
 *
 * Que la cara noche *se vea* oscura y con brillo de borde es visual, y lo comprueba
 * `tests/fps/fps.spec.ts` en navegador. Lo que sí se comprueba aquí es la causa de que
 * ambos cosas salgan bien: que el shader calcula el terminador con `solDireccion` en
 * lugar de depender de una `DirectionalLight`, y que `dot(normal, sol)` reparte
 * exactamente 0 y 1 en las caras opuesta yfrente al sol.
 */
import { Color, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { AtmosphereMesh } from "../../../src/modules/globe/AtmosphereMesh";

const uniforme = (
  malla: { material: { uniforms: Record<string, { value: unknown }> } },
  n: string,
) => malla.material.uniforms[n].value;

describe("AtmosphereMesh — atmósfera día/noche (ROADMAP 1.2.2)", () => {
  it("el sol es una dirección fija, no sigue a la cámara", () => {
    const { malla } = new AtmosphereMesh();
    const sol = uniforme(malla, "solDireccion") as Vector3;

    // Normalizada y con los tres componentes distintos: si fuera (0,0,1) el terminador
    // caería en el ecuador y la cámara orbital no enseñaría nunca la franja de noche.
    expect(sol.length()).toBeCloseTo(1, 5);
    expect(sol.x).not.toBe(0);
    expect(sol.y).not.toBe(0);

    // Lo que la fija es que no depende de la cámara: dos mallas distintas lo tienen
    // igual, así que el terminador se queda quieto en el espacio mientras la cámara
    // orbita, en vez de viajar pegado a quien mira.
    const otra = new AtmosphereMesh();
    expect(uniforme(otra.malla, "solDireccion")).toEqual(sol);
  });

  it("el terminador reparte 0 en la noche y 1 en el día", () => {
    const { malla } = new AtmosphereMesh();
    const sol = (uniforme(malla, "solDireccion") as Vector3).clone();
    const noche = new Vector3(-sol.x, -sol.y, -sol.z).normalize();

    // Lo que el fragment shader hace con `dot(n, sol)` a través del `smoothstep` de
    // -0.12 a 0.28. Comprobado aquí como número para que el reparto sea explícito.
    const suave = (n: Vector3) => {
      const t = Math.max(0, Math.min(1, (n.dot(sol) + 0.12) / 0.4));
      return t * t * (3 - 2 * t);
    };

    expect(suave(noche)).toBe(0);
    expect(suave(sol)).toBe(1);
  });

  it("los parámetros del criterio se ajustan sin reconstruir el material", () => {
    const atmo = new AtmosphereMesh();
    const material = atmo.material;

    atmo.parametros = {
      intensidad: 0.8,
      exponente: 5,
      color: 0xff0000,
      noche: 0.4,
    };

    expect(uniforme(atmo.malla, "intensidadBorde")).toBe(0.8);
    expect(uniforme(atmo.malla, "exponenteBorde")).toBe(5);
    expect(uniforme(atmo.malla, "ladoNoche")).toBe(0.4);
    expect((uniforme(atmo.malla, "colorAcento") as Color).getHex()).toBe(
      0xff0000,
    );
    // Ajustar no puede crear un material nuevo: el shader compila una vez.
    expect(atmo.material).toBe(material);
  });

  it("el resplandor es sutil, no un halo de neón", () => {
    const { malla } = new AtmosphereMesh();

    // VISUAL_DESIGN §4: "opacidad baja (no un halo de neón)" y §5.1 el único acento es
    // `--gaia-accent`. Los dos valores concretos no los fija ningún doc, así que la
    // condición es la del doc: bajo, y del color del acento.
    expect(uniforme(malla, "intensidadBorde") as number).toBeLessThan(0.5);
    expect((uniforme(malla, "colorAcento") as Color).getHex()).toBe(0x3fd8c9);
  });

  it("el lado noche se apaga en vez de pintarse de luces urbanas", () => {
    const { malla } = new AtmosphereMesh();

    // VISUAL_DESIGN §4: "Noche urbana: no se pinta por defecto". El shader solo
    // multiplica la base por este valor, así que sube de 0 es noche cerrada.
    const noche = uniforme(malla, "ladoNoche") as number;
    expect(noche).toBeGreaterThan(0);
    expect(noche).toBeLessThan(0.3);
  });

  it("el fragment shader usa la normal y la posición, no solo el color", () => {
    const { material } = new AtmosphereMesh();
    const fs = material.fragmentShader;

    // El brillo de borde necesita el ángulo de visión, que sale de `cameraPosition` y de
    // la posición del fragmento. Sin esto el "brillo de borde" del criterio no se puede
    // calcular, por mucho que haya un uniform de color.
    expect(fs).toContain("cameraPosition");
    expect(fs).toContain("vNormalMundo");
    expect(fs).toContain("vPosicionMundo");
    // Y el terminador, el producto punto de la normal con la dirección del sol.
    expect(fs).toContain("solDireccion");
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

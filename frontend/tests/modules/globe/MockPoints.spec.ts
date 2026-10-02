/**
 * Dataset estático de 100 puntos sobre el globo (ROADMAP 1.6.1).
 *
 * Aquí se comprueba lo que se puede medir sin GPU: que la rejilla sea la que se dice
 * (100 puntos, uniformes, sin polos ni costura) y que cada punto esté en la esfera, sobre la
 * superficie. La alineación *visible* contra la textura la revisa el usuario en el navegador
 * (Playwright sigue colgándose en este entorno).
 */
import { Matrix4 } from "three";
import { describe, expect, it } from "vitest";

import {
  crearPuntosMock,
  REJILLA_MOCK,
} from "../../../src/modules/globe/MockPoints";
import { RADIO_TIERRA } from "../../../src/utils/coordinates";

/** Centro de la instancia `i`: la rejilla cabe en una matriz, sin pedirle nada a Three. */
const centroDe = (malla: ReturnType<typeof crearPuntosMock>, i: number) =>
  new Matrix4()
    .fromArray(
      Array.from(malla.instanceMatrix.array.slice(i * 16, i * 16 + 16)),
    )
    .elements.slice(12, 15);

describe("crearPuntosMock — el dataset de 100 puntos (ROADMAP 1.6.1)", () => {
  it("son 100, en una rejilla de 10 × 10", () => {
    const malla = crearPuntosMock();

    expect(REJILLA_MOCK).toHaveLength(100);
    expect(malla.count).toBe(100);
    expect(new Set(REJILLA_MOCK.map((p) => p.lat)).size).toBe(10);
    expect(new Set(REJILLA_MOCK.map((p) => p.lon)).size).toBe(10);
  });

  it("cada punto cae en su lat/lon, sobre la superficie", () => {
    const malla = crearPuntosMock();

    REJILLA_MOCK.forEach(({ lat, lon }, i) => {
      const [x, y, z] = centroDe(malla, i);
      // Deshacer la posición a lat/lon es la mejor forma de probar el criterio sin GPU: si el
      // punto vuelve a su coordenada, cayó donde debía, y el radio lo dice.
      const latitud = Math.asin(y / Math.hypot(x, y, z)) * (180 / Math.PI);
      const longitud = (() => {
        const grados = Math.atan2(z, -x) * (180 / Math.PI) - 180;
        return ((((grados + 180) % 360) + 360) % 360) - 180;
      })();

      expect(latitud).toBeCloseTo(lat, 4);
      expect(longitud).toBeCloseTo(lon, 4);
      // Radio 1,005 (0,5 % sobre la superficie): lo justo para que el punto no se hunda en
      // el geoide ni para que se note flotando.
      expect(Math.hypot(x, y, z)).toBeCloseTo(RADIO_TIERRA + 0.005, 4);
    });
  });

  it("la rejilla no toca los polos ni la costura del antimeridiano", () => {
    // Ahí el mapeo es degenerado: todos los meridianos se juntan en el polo y ±180 son el
    // mismo punto. Un punto en el borde mediría una flecha ambigua, no una desalineación.
    for (const { lat, lon } of REJILLA_MOCK) {
      expect(Math.abs(lat)).toBeLessThan(90);
      expect(Math.abs(lon)).toBeLessThan(180);
    }
  });

  it("cubre los cuatro cuadrantes, para que ningún hemisferio quede sin comprobar", () => {
    const signos = REJILLA_MOCK.reduce(
      (acc, { lat, lon }) => acc.add(`${Math.sign(lat)}${Math.sign(lon)}`),
      new Set<string>(),
    );

    expect(signos).toEqual(new Set(["-1-1", "-11", "1-1", "11"]));
  });

  it("un solo draw call y material plano: aquí se prueba dónde, no cómo se ve", () => {
    const malla = crearPuntosMock();

    // Un `InstancedMesh` = una llamada de dibujo, el presupuesto que WORKFLOWS §3 fija para
    // la capa de incendios. El material no lee luces, así que lo que se ve es la posición.
    expect(malla.isInstancedMesh).toBe(true);
    expect(malla.material.type).toBe("MeshBasicMaterial");
  });
});

/**
 * Decodificador Terrarium (ROADMAP 1.3.1).
 *
 * `docs/GAIA_GLOBE_TEXTURES.md` §2.1 fija el formato en bytes: la elevación en
 * metros es `(R × 256 + G + B / 256) − 32768`. El vertex shader usa la misma
 * cuenta en GLSL con el texel normalizado, así que esta función debe cuadrar
 * exactamente con la fórmula del doc o el relieve sale desplazado.
 *
 * Los vectores de prueba salen de la codificación (elevación + 32768 → dos bytes):
 * - nivel del mar → 0 m → 32768 → (128, 0, 0).
 * - Everest → +8848 m → 41616 → (162, 144, 0).
 * - Fosa de las Marianas → −11034 m → 21734 → (84, 230, 0).
 * - máximo de la codificación → +32767 m → 65535 → (255, 255, 0).
 */
import { describe, expect, it } from "vitest";

import {
  DESFASE_ATLAS_COLUMNAS,
  decodeTerrarium,
  filaMercatorDeLat,
  latDeFilaEquirect,
  urlTileTerrarium,
} from "../../src/utils/terrarium";

describe("terrarium — decodeTerrarium (ROADMAP 1.3.1)", () => {
  it("nivel del mar es 0 metros", () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
  });

  it("el Everest sale en 8848 metros", () => {
    expect(decodeTerrarium(162, 144, 0)).toBe(8848);
  });

  it("la fosa de las Marianas sale en negativo", () => {
    expect(decodeTerrarium(84, 230, 0)).toBe(-11034);
  });

  it("el máximo de la codificación es 32767 metros", () => {
    expect(decodeTerrarium(255, 255, 0)).toBe(32767);
  });
});

/**
 * Atlas de DEM z3 en runtime (ROADMAP 1.3.3).
 *
 * Los números no son inventados: salen de la convención que siguen los dos assets
 * validados en 1.3.1 y de la verificación contra `elevacion_alta.png` (z2) descrita en
 * `DESFASE_ATLAS_COLUMNAS`. En particular, las filas sin dato son 28 de 512 en el asset
 * (medido) y 56 de 1024 aquí: si la regla de los polos cambiara, el atlas z3 tendría una
 * corona de relieve que el z2 no tiene y el cruce entre niveles daría un escalón.
 */
describe("terrarium — geometría del atlas z3 (ROADMAP 1.3.3)", () => {
  it("la URL es la plantilla Terrarium del doc, con {z}/{x}/{y}", () => {
    expect(urlTileTerrarium(3, 5, 3)).toBe(
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/3/5/3.png",
    );
  });

  it("el ecuador cae en la mitad del atlas mercator", () => {
    expect(filaMercatorDeLat(0, 2048)).toBe(1024);
  });

  it("el Everest (27.988°N) cae en la fila 858 de 2048", () => {
    expect(filaMercatorDeLat(27.988, 2048)).toBe(858);
  });

  it("latitudes conocidas caen donde toca", () => {
    expect(filaMercatorDeLat(-33, 2048)).toBe(1223); // Sídney
    expect(filaMercatorDeLat(60, 2048)).toBe(594); // Oslo
    expect(filaMercatorDeLat(84, 2048)).toBe(62); // casi el límite
  });

  it("más allá del límite mercator no hay dato, no se estira el borde", () => {
    expect(filaMercatorDeLat(85.05112878, 2048)).toBe(0);
    expect(filaMercatorDeLat(85.1, 2048)).toBeNull();
    expect(filaMercatorDeLat(-89, 2048)).toBeNull();
  });

  it("las filas del atlas equirect cubren de polo a polo centradas", () => {
    expect(latDeFilaEquirect(0, 1024)).toBeCloseTo(89.912109375, 9);
    expect(latDeFilaEquirect(511, 1024)).toBeCloseTo(0.087890625, 9);
    expect(latDeFilaEquirect(512, 1024)).toBeCloseTo(-0.087890625, 9);
    expect(latDeFilaEquirect(1023, 1024)).toBeCloseTo(-89.912109375, 9);
  });

  it("los polos sin dato son 56 filas de 1024 (28 de 512 en el asset z2)", () => {
    const sinDato = [];
    for (let fila = 0; fila < 1024; fila++) {
      if (filaMercatorDeLat(latDeFilaEquirect(fila, 1024), 2048) === null) {
        sinDato.push(fila);
      }
    }
    expect(sinDato).toHaveLength(56);
    expect(sinDato[0]).toBe(0);
    expect(sinDato[55]).toBe(1023);
  });

  it("el desfase es el cuarto de vuelta medido contra el asset z2", () => {
    expect(DESFASE_ATLAS_COLUMNAS).toBe(0.25);
  });
});

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

import { decodeTerrarium } from "../../src/utils/terrarium";

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

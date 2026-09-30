/**
 * LOD de elevación (ROADMAP 1.3.1).
 *
 * Dos niveles de heightmap global, elegidos por distancia de cámara con un
 * crossfade (`smoothstep`) para que el criterio "sin caídas bruscas en LOD" se
 * cumpla por construcción: no hay un momento en que el relieve salte, el peso de
 * un nivel al otro es continuo.
 *
 * `ESCALA_ELEVACION` convierte metros (Terrarium) en fracción de radio. 2,5e-6 es
 * calibración: el Everest (8848 m) desplaza un 2,2 % del radio, visible sin que el
 * globo parezca "peludo". `NIVEL_MAR` (1.3.2) aplana lo que queda bajo el nivel del
 * mar: la superficie terrestre no muestra la batimetría (el océano lo dibuja F2).
 */
import { describe, expect, it } from "vitest";

import {
  DISTANCIA_BASE,
  DISTANCIA_DETALLE,
  ESCALA_ELEVACION,
  NIVEL_MAR,
  desplazamiento,
  pesoNivel,
} from "../../../src/modules/globe/ElevationLOD";

describe("ElevationLOD — datos de elevación por LOD (ROADMAP 1.3.1)", () => {
  it("lejos se usa solo el nivel bajo (peso 0)", () => {
    expect(pesoNivel(6)).toBe(0);
  });

  it("cerca se usa solo el nivel alto (peso 1)", () => {
    expect(pesoNivel(1.05)).toBe(1);
  });

  it("el cruce es continuo, sin salto brusco", () => {
    const d = (DISTANCIA_DETALLE + DISTANCIA_BASE) / 2;
    const w = pesoNivel(d);
    const wSiguiente = pesoNivel(d + 0.01);

    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    expect(Math.abs(wSiguiente - w)).toBeLessThan(0.02);
  });

  it("el peso baja al alejarse (monótono)", () => {
    const d1 = DISTANCIA_DETALLE + 0.2;
    const d2 = d1 + 0.3;
    expect(pesoNivel(d1)).toBeGreaterThan(pesoNivel(d2));
  });

  it("la escala convierte metros en fracción de radio", () => {
    expect(ESCALA_ELEVACION).toBeGreaterThan(0);
    expect(desplazamiento(8848)).toBeCloseTo(0.0221, 3);
    expect(desplazamiento(0)).toBe(0);
  });

  it("NIVEL_MAR es una constante canónica (océanos planos, 1.3.2)", () => {
    expect(NIVEL_MAR).toBe(0);
  });

  it("lo que queda bajo el nivel del mar se aplana, no hace hoyos", () => {
    // La batimetría (Mariana, −11034 m) no debe desplazar la superficie terrestre:
    // el mar lo dibuja F2, así que bajo el nivel del mar todo vale 0.
    expect(desplazamiento(-11034)).toBe(0);
    expect(desplazamiento(-1)).toBe(0);
    expect(desplazamiento(NIVEL_MAR - 100)).toBe(0);
    expect(desplazamiento(1)).toBeCloseTo(2.5e-6, 20);
  });
});

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
  MALLAS,
  MARGEN_MALLA,
  NIVEL_MAR,
  desplazamiento,
  indiceMalla,
  mezclaTresNiveles,
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

/**
 * Escalera de mallas del relieve (ROADMAP 1.3.3, decisión del usuario del 30-09-2026).
 *
 * Los tres peldaños son `256×128` → `512×256` → `1024×512` segmentos: 157, 78 y 39 km de
 * espaciado en el ecuador. La malla de 1.2.1 (`128×64`, 313 km) se retira porque un
 * vértice cada 313 km no puede dibujar una cordillera: los Andes tienen 200 km de ancho.
 */
describe("ElevationLOD — escalera de mallas del relieve (ROADMAP 1.3.3)", () => {
  it("son tres peldaños, cada uno el doble de fino que el anterior", () => {
    expect(MALLAS).toHaveLength(3);
    for (let i = 1; i < MALLAS.length; i++) {
      expect(MALLAS[i].ancho).toBe(MALLAS[i - 1].ancho * 2);
      expect(MALLAS[i].alto).toBe(MALLAS[i - 1].alto * 2);
    }
  });

  it("el espaciado va de continentes a cordilleras (40075 km / segmentos)", () => {
    expect(40075 / MALLAS[0].ancho).toBeCloseTo(157, 0);
    expect(40075 / MALLAS[2].ancho).toBeCloseTo(39, 0);
    // La malla retirada dejaría 313 km por vértice en el ecuador.
    expect(40075 / 128).toBeCloseTo(313, 0);
  });

  it("lejos elige la más gruesa, en el arranque la media y de cerca la más fina", () => {
    expect(indiceMalla(6)).toBe(0);
    // El encuadre de arranque de 1.1.2 cae en 2,83–2,92 (ver `distanciaDeEncuadre`).
    expect(indiceMalla(2.9)).toBe(1);
    expect(indiceMalla(1.05)).toBe(2);
  });

  it("los umbrales son las bandas del heightmap, así que no cambian a la vez", () => {
    // En el umbral exacto el peso del heightmap ya está saturado: la malla se puede
    // reconstruir sin que el relieve esté a medio cruzar (eso sería un salto doble).
    expect(pesoNivel(DISTANCIA_BASE)).toBe(0);
    expect(pesoNivel(DISTANCIA_DETALLE)).toBe(1);
  });

  it("no oscila parada sobre un umbral: el peldaño puesto no cambia dentro del margen", () => {
    expect(indiceMalla(DISTANCIA_BASE, 1)).toBe(1);
    expect(indiceMalla(DISTANCIA_DETALLE, 1)).toBe(1);
    expect(indiceMalla(DISTANCIA_DETALLE + MARGEN_MALLA / 2, 2)).toBe(2);
    expect(indiceMalla(DISTANCIA_BASE - MARGEN_MALLA / 2, 0)).toBe(0);
  });

  it("cruza el margen completo y entonces sí cambia de peldaño", () => {
    expect(indiceMalla(DISTANCIA_BASE + MARGEN_MALLA, 1)).toBe(0);
    expect(indiceMalla(DISTANCIA_BASE - MARGEN_MALLA, 0)).toBe(1);
    expect(indiceMalla(DISTANCIA_DETALLE + MARGEN_MALLA, 2)).toBe(1);
    expect(indiceMalla(DISTANCIA_DETALLE - MARGEN_MALLA, 1)).toBe(2);
  });
});

/**
 * Reparto de la rampa entre los tres niveles de DEM (ROADMAP 1.3.3).
 *
 * Decisión del usuario del 30-09-2026: el z3 del runtime entra en la segunda mitad de
 * la rampa validada de 1.3.1 (el z1→z2 la cruza en la primera). Lo que se prueba aquí
 * es que (a) sin tercer nivel la mezcla es exactamente la de 1.3.1 —el z1 no se cuela
 * como fantasma—, (b) con él cada par cruza en media rampa y (c) los tres pesos suman 1,
 * que es la invariante que rompería una fórmula mal copiada al shader.
 */
describe("ElevationLOD — mezcla de los tres niveles de DEM (ROADMAP 1.3.3)", () => {
  it("sin tercer nivel devuelve la rampa de 1.3.1 y el nivel alto apagado", () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      expect(mezclaTresNiveles(p, false)).toEqual({ medio: p, alto: 0 });
    }
  });

  it("con tercer nivel cada par cruza en media rampa", () => {
    expect(mezclaTresNiveles(0, true)).toEqual({ medio: 0, alto: 0 });
    expect(mezclaTresNiveles(0.25, true)).toEqual({ medio: 0.5, alto: 0 });
    expect(mezclaTresNiveles(0.5, true)).toEqual({ medio: 1, alto: 0 });
    expect(mezclaTresNiveles(0.75, true)).toEqual({ medio: 1, alto: 0.5 });
    expect(mezclaTresNiveles(1, true)).toEqual({ medio: 1, alto: 1 });
  });

  it("en la mitad cercana de la rampa el nivel grueso ya no pesa nada", () => {
    // Peso del z1 = (1 - medio) · (1 - alto): 0 desde que el z2 está completo, que es
    // lo que evita ver la textura de 78 km/px en los acercamientos.
    for (const p of [0.5, 0.6, 0.75, 0.9, 1]) {
      const { medio, alto } = mezclaTresNiveles(p, true);
      expect((1 - medio) * (1 - alto)).toBe(0);
    }
  });

  it("los tres pesos suman 1 en toda la rampa", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      const { medio, alto } = mezclaTresNiveles(p, true);
      const bajo = (1 - medio) * (1 - alto);
      const z3 = alto;
      expect(bajo + medio * (1 - alto) + z3).toBeCloseTo(1, 10);
    }
  });
});

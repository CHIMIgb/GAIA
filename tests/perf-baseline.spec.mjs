/**
 * Comparativa contra el baseline versionado (ROADMAP 0.7.12).
 *
 * Solo se prueba la función pura con datos planos: atar el test a `dist/` o a un
 * fichero de verdad lo convertiría en un test de la maqueta de CI.
 */
import { describe, expect, it } from "vitest";

import { TOLERANCIA_PCT, compara, ultima } from "../scripts/perf-baseline.mjs";

const BASE = { bundle_js_inicial_kib: 66.8, bundle_chunk_arranque_kib: 66.8 };

describe("comparar contra el baseline", () => {
  it("si nada empeora, no hay fallos", () => {
    expect(compara(BASE, BASE).filter((c) => c.incumple)).toEqual([]);
  });

  it("mejorar no es fallar, aunque mueva la cifra", () => {
    const comparacion = compara(
      { bundle_js_inicial_kib: 60, bundle_chunk_arranque_kib: 66.8 },
      BASE,
    );
    expect(comparacion.filter((c) => c.incumple)).toEqual([]);
    expect(comparacion[0].deltaPct).toBeLessThan(0);
  });

  it("empeorar por debajo de la tolerancia no tumba", () => {
    // +0,5 % con tolerancia del 1 %: el gzip se mueve solo al tocar una dependencia.
    const actual = { ...BASE, bundle_js_inicial_kib: 67.1 };
    expect(compara(actual, BASE).filter((c) => c.incumple)).toEqual([]);
  });

  it("empeorar por encima de la tolerancia tumba y dice de cuanto", () => {
    const actual = { ...BASE, bundle_js_inicial_kib: 80 };
    const fallos = compara(actual, BASE).filter((c) => c.incumple);
    expect(fallos).toHaveLength(1);
    expect(fallos[0].metrica).toBe("bundle_js_inicial_kib");
    expect(fallos[0].antes).toBe(66.8);
    expect(fallos[0].ahora).toBe(80);
    expect(fallos[0].deltaPct).toBeGreaterThan(TOLERANCIA_PCT);
  });

  it("una metrica que el baseline no tiene se salta, no truena", () => {
    const actual = { ...BASE, bundle_css_kib: 40 };
    const claves = compara(actual, BASE).map((c) => c.metrica);
    expect(claves).toEqual([
      "bundle_js_inicial_kib",
      "bundle_chunk_arranque_kib",
    ]);
  });
});

describe("elegir la medicion de referencia", () => {
  it("sin historial no hay contra que comparar y no es un fallo", () => {
    expect(ultima([])).toBeNull();
    expect(compara(BASE, null).filter((c) => c.incumple)).toEqual([]);
  });

  it("la referencia es la ultima entrada, no la primera", () => {
    expect(
      ultima([{ metricas: { x: 1 } }, { metricas: { x: 2 } }]).metricas,
    ).toEqual({ x: 2 });
  });
});

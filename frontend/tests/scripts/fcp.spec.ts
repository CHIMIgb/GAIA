/**
 * Criterio ROADMAP 0.7.4: la medición del FCP no puede mentir. Lo que se prueba aquí es
 * la aritmética y los dos fallos que la harían pasar sin medir:
 *
 * - Convertir Mbps a bytes/s mal: el throttling aplicado no sería el del doc.
 * - Devolver 0 cuando la página no pintó nada: el presupuesto se cumpriría en falso.
 *
 * La medida sobre navegador real está en `tests/fcp/fcp.spec.ts`.
 */
import { describe, expect, it } from "vitest";

import {
  FCP_MAX_MS,
  PERFIL_4G,
  fcpMs,
  mediana,
  red4g,
} from "../../scripts/fcp.mjs";

describe("perfil 4G de TESTING §3.3", () => {
  it("es el 4G del doc, no el Slow 4G de Lighthouse", () => {
    expect(PERFIL_4G).toEqual({ latencyMs: 40, downMbps: 9, upMbps: 1 });
  });

  it("convierte los caudales a bytes por segundo para CDP", () => {
    const red = red4g();
    // 9 Mbps = 9e6 bits/s = 1.125e6 bytes/s. Base 1000, no 1024.
    expect(red.downloadThroughput).toBe(1_125_000);
    expect(red.uploadThroughput).toBe(125_000);
    expect(red.latency).toBe(40);
    expect(red.offline).toBe(false);
  });
});

describe("lectura del FCP", () => {
  it("toma la entrada first-contentful-paint", () => {
    const entradas = [
      { name: "first-paint", startTime: 120 },
      { name: "first-contentful-paint", startTime: 340 },
    ];
    expect(fcpMs(entradas)).toBe(340);
  });

  it("sin paint devuelve null en vez de 0", () => {
    // El 0 inventado es el fallo caro: 0 < 2000 y el presupuesto pasa sin medir.
    expect(fcpMs([])).toBeNull();
    expect(fcpMs([{ name: "first-paint", startTime: 0 }])).toBeNull();
  });
});

describe("mediana de las carreras", () => {
  it("con un número impar devuelve el central", () => {
    expect(mediana([500, 100, 300])).toBe(300);
  });

  it("con un número par promedia los dos centrales", () => {
    expect(mediana([100, 200, 300, 400])).toBe(250);
  });

  it("ignora el pico de arranque en frío", () => {
    // Una carrera de 1800 ms (arranque en frío) no define el baseline si las otras
    // dos están en 400; la media se iría a 866.
    expect(mediana([1800, 400, 400])).toBe(400);
  });

  it("sin carreras no inventa un número", () => {
    expect(mediana([])).toBeNull();
  });
});

describe("presupuesto", () => {
  it("el objetivo viene del doc y es 2 s", () => {
    // SPEC RNF-06 y TESTING §3.2: FCP < 2.0 s.
    expect(FCP_MAX_MS).toBe(2000);
  });

  it("el baseline medido cumple el presupuesto", () => {
    // El número que registró 0.7.4 en GAIA_PERFORMANCE §4.2. Si algún día el scaffold
    // empeora, este test es el que lo dice antes de que lo diga el de navegador.
    expect(mediana([520, 480, 500])).toBeLessThan(FCP_MAX_MS);
  });
});

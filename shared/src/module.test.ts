/**
 * Criterio ROADMAP 0.2.4: un módulo "prueba" mínimo cumple el contrato `DataModule`
 * sin romper el servidor.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type { DataModule, DataWorkerId } from "./module";
import { probeModule, type ProbeResult } from "./modules/probe";

// Comprobación de tipos: si el contrato y el módulo divergen, falla el typecheck.
const _contrato: DataModule<ProbeResult> = probeModule;
void _contrato;

const HEALTH_OK = {
  success: true,
  data: { status: "ok", redis: "connected" },
  error: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("módulo de prueba", () => {
  it("declara endpoint, ttl, retention y worker del contrato", () => {
    expect(probeModule.endpoint).toBe("/api/health");
    expect(probeModule.ttl).toBeGreaterThan(0);
    expect(probeModule.retention).toBeGreaterThan(0);
    expect([1, 2, 3]).toContain<number>(probeModule.worker);
  });

  it("fetchRaw devuelve el sobre del contrato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => HEALTH_OK }),
    );

    await expect(probeModule.fetchRaw()).resolves.toEqual(HEALTH_OK);
  });

  it("fetchRaw propaga el error del contrato", async () => {
    const failure = {
      success: false,
      data: null,
      error: { code: "UPSTREAM_UNAVAILABLE", message: "sin respuesta" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => failure }),
    );

    await expect(probeModule.fetchRaw()).resolves.toEqual(failure);
  });

  it("normalize devuelve los ítems del módulo", () => {
    expect(probeModule.normalize(HEALTH_OK)).toEqual([
      { status: "ok", redis: "connected" },
    ]);
  });

  it("normalize rechaza un sobre inválido", () => {
    expect(() => probeModule.normalize({ data: "nope" })).toThrow();
  });

  it("el worker es un DataWorkerId válido", () => {
    const worker: DataWorkerId = probeModule.worker;
    expect(worker).toBe(1);
  });
});

import { describe, expect, it } from "vitest";

import { pluginsDeAnalisis } from "../../vite.config";

const nombres = (mode: string) =>
  pluginsDeAnalisis(mode)?.rollupOptions.plugins.map((p) => p.name);

describe("reporte de chunks (0.7.6)", () => {
  it("se genera solo en el mode analyze", () => {
    expect(nombres("analyze")).toContain("visualizer");
  });

  it("un build normal no paga ni deja el reporte", () => {
    // Si el plugin se colgara siempre, cada build dejaría un stats.html en
    // dist y pagaría el coste de serializar el grafo sin nadie mirarlo.
    expect(pluginsDeAnalisis("production")).toBeUndefined();
  });
});

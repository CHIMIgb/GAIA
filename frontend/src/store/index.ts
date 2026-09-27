import { proxy } from "valtio";

import type { GaiaState, ModuleId, ModuleStatus } from "./state.types";

const pending = (module: ModuleId): ModuleStatus => ({
  state: "error",
  lastUpdate: null,
  cachedAt: null,
  lastError: `Sin respuesta inicial de ${module}`,
});

/** Estado inicial sin datos (`GAIA_STATE.md` §2.3). */
export const state = proxy<GaiaState>({
  layers: {
    fire: false,
    wind: false,
    seismic: false,
    flood: false,
    radiation: false,
  },
  filters: { timeRange: "24h" },
  flood: { seaLevel: 0, waterShaderActive: true, waveAnimation: true },
  selectedObject: null,
  telemetry: { open: false, pinned: false, anchorX: 0, anchorY: 0 },
  connectionStatus: {
    fires: pending("fires"),
    quakes: pending("quakes"),
    wind: pending("wind"),
    radiation: pending("radiation"),
    elevation: pending("elevation"),
    backend: pending("backend"),
    workers: pending("workers"),
  },
  performance: {
    fps: 0,
    frameTimeMs: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  },
  wind: { speedKnots: 0, particleCount: 18000 },
  seismic: { recentQuakeId: null, shockwaveActive: false },
  radiation: { criticalCount: 0 },
  debug: { showStats: false },
});

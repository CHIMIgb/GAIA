/**
 * Shape del estado global. Transcrito literalmente de `GAIA_STATE.md` §2.2-3.7:
 * si aquí se toca una forma, se toca el doc y al revés.
 */

export const GLOBE_LAYERS = [
  "fire",
  "wind",
  "seismic",
  "flood",
  "radiation",
] as const;
export type LayerId = (typeof GLOBE_LAYERS)[number];

export interface LayerVisibility {
  fire: boolean; // NASA FIRMS — InstancedMesh
  wind: boolean; // Open-Meteo — sistema de partículas GPU
  seismic: boolean; // USGS — columnas cilíndricas + ondas
  flood: boolean; // GEBCO — water shader + mascarado costero
  radiation: boolean; // Safecast/EURDEP/RadNet — InstancedMesh/heatmap
}

export type TimeFilter = "24h" | "7d" | "30d";

export interface FloodState {
  seaLevel: number;
  waterShaderActive: boolean;
  waveAnimation: boolean;
}

export const SEA_LEVEL_MIN = 0;
export const SEA_LEVEL_MAX = 10;

export type SelectedObject =
  | {
      type: "fire";
      instanceId: number;
      lat: number;
      lon: number;
      data: unknown;
    }
  | {
      type: "quake";
      instanceId: number;
      lat: number;
      lon: number;
      data: unknown;
    }
  | {
      type: "wind";
      instanceId: number;
      lat: number;
      lon: number;
      data: unknown;
    }
  | {
      type: "radiation";
      instanceId: number;
      lat: number;
      lon: number;
      data: unknown;
    };

export interface TelemetryPanel {
  open: boolean;
  pinned: boolean;
  anchorX: number;
  anchorY: number;
}

export type ConnectionState =
  "loading" | "live" | "cached" | "fallback" | "error";

export const DATA_MODULES = [
  "fires",
  "quakes",
  "wind",
  "radiation",
  "elevation",
] as const;
export type DataModuleId = (typeof DATA_MODULES)[number];

export const INFRA_MODULES = ["backend", "workers"] as const;
export type InfraModuleId = (typeof INFRA_MODULES)[number];

export type ModuleId = DataModuleId | InfraModuleId;

export interface ModuleStatus {
  state: ConnectionState;
  /** Timestamp (ms) de la última respuesta útil. */
  lastUpdate: number | null;
  /** Timestamp (ms) del último dato que provino de caché Redis. */
  cachedAt: number | null;
  /** Mensaje del último error (contrato `error.message`), null si OK. */
  lastError: string | null;
}

export type ConnectionStatus = Record<ModuleId, ModuleStatus>;

export interface PerformanceCounters {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export interface WindStats {
  speedKnots: number;
  particleCount: number;
}

export interface SeismicStats {
  recentQuakeId: string | null;
  shockwaveActive: boolean;
}

export interface RadiationStats {
  criticalCount: number;
}

export interface GaiaState {
  /** Toggles de visibilidad de las 5 capas del globo. */
  layers: LayerVisibility;
  /** Filtro temporal activo (24h, 7d, 30d). */
  filters: { timeRange: TimeFilter };
  /** Subsistema de inundación: nivel del mar y flags del water shader. */
  flood: FloodState;
  /** Objeto seleccionado por raycasting. `null` cuando no hay selección. */
  selectedObject: SelectedObject | null;
  /** Contenedor del panel flotante de telemetría. */
  telemetry: TelemetryPanel;
  /** Estado de conexión / modo resguardo por módulo de datos e infraestructura. */
  connectionStatus: ConnectionStatus;
  /** Contadores de rendimiento medidos por el render loop. */
  performance: PerformanceCounters;
  /** Telemetría efímera del módulo de viento. */
  wind: WindStats;
  /** Estado de la onda de choque sísmica reciente (< 2h). */
  seismic: SeismicStats;
  /** Contador de lecturas radiológicas críticas para el badge de alerta. */
  radiation: RadiationStats;
  /** Flags de desarrollo (overlay de stats). */
  debug: { showStats: boolean };
}

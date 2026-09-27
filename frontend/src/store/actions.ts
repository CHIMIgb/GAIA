/**
 * Catálogo de acciones de `GAIA_STATE.md` §6.1. Toda escritura al store pasa por
 * aquí: las reglas de quién escribe qué (Three.js vs React) están en §4.
 */
import { GaiaAPIError } from "../services/api";
import { state } from "./index";
import {
  SEA_LEVEL_MAX,
  SEA_LEVEL_MIN,
  type LayerId,
  type ModuleId,
  type ModuleStatus,
  type SelectedObject,
  type TimeFilter,
} from "./state.types";

/** Activa/desactiva una capa. Dueño: React (LayerControls). */
export function toggleLayer(layer: LayerId): void {
  state.layers[layer] = !state.layers[layer];
}

/** Cambia el rango temporal. El re-filtrado en los workers llega en 0.4.3. */
export function setTimeFilter(range: TimeFilter): void {
  state.filters.timeRange = range;
}

/** Actualiza el nivel del mar con clamping a [0, 10] m. Dueño: React (slider). */
export function setSeaLevel(meters: number): void {
  state.flood.seaLevel = Math.min(
    SEA_LEVEL_MAX,
    Math.max(SEA_LEVEL_MIN, meters),
  );
}

/** Selecciona un objeto por raycasting y abre el panel de telemetría. */
export function selectObject(sel: SelectedObject): void {
  state.selectedObject = sel;
  state.telemetry.open = true;
  state.telemetry.pinned = false;
}

/** Limpia la selección activa y cierra el panel. */
export function clearSelection(): void {
  state.selectedObject = null;
  state.telemetry.open = false;
  state.telemetry.pinned = false;
}

/** Actualiza el estado de conexión de un módulo (merge parcial). */
export function setConnectionStatus(
  module: ModuleId,
  patch: Partial<ModuleStatus>,
): void {
  Object.assign(state.connectionStatus[module], patch);
}

/**
 * Escribe el resultado de una petición en `connectionStatus`: `loading` mientras
 * vuela, `live` con la hora al resolverse y `error` con el código del contrato si
 * falla. Es el write path del orquestador de datos que nombra STATE §6.4.
 *
 * `lastError: null` va explícito porque `setConnectionStatus` es merge parcial
 * (§6.1) y no limpia campos sola.
 */
export async function runDataRequest<T>(
  module: ModuleId,
  request: () => Promise<T>,
): Promise<T> {
  setConnectionStatus(module, { state: "loading" });
  try {
    const data = await request();
    setConnectionStatus(module, {
      state: "live",
      lastUpdate: Date.now(),
      lastError: null,
    });
    return data;
  } catch (error) {
    const lastError =
      error instanceof GaiaAPIError ? error.code : "INTERNAL_SERVER_ERROR";
    setConnectionStatus(module, { state: "error", lastError });
    throw error;
  }
}

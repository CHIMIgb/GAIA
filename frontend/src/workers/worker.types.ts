/**
 * Protocolo de mensajes Main ↔ Worker.
 *
 * Los nombres de mensaje están fijados por `docs/GAIA_TESTING.md` §6.3 y
 * `docs/GAIA_PROJECT_STRUCTURE.md` §5.4 (`FIRES_READY`, `QUAKES_READY`,
 * `WIND_READY`, `RADIATION_READY`); los payloads viajan como `Transferable`
 * (zero-copy) según PROJECT_STRUCTURE §5.4.
 *
 * Los workers nunca tocan el proxy de Valtio: solo devuelven datos y es el hilo
 * principal quien muta `state` (STATE §4).
 */

/** Campos por instancia de incendio, en el orden que espera el InstancedMesh. */
export const FIRE_STRIDE = 7;

export type MessageKind =
  "FIRES_READY" | "QUAKES_READY" | "WIND_READY" | "RADIATION_READY";

/** Identificadores de los 3 workers de cómputo (SPEC §2, capa 2). */
export type WorkerId = 1 | 2 | 3;

/** Un hotspot de incendio empaquetado: (x, y, z, r, g, b, scale). */
export type FireInstance = Float32Array;

export interface FiresReadyMessage {
  kind: "FIRES_READY";
  /** Módulo de datos que originó el mensaje (`fires`, `quakes`…). */
  source: string;
  /** Fuente concreta dentro del módulo (`VIIRS`, `MODIS`…), para deduplicar. */
  dataSource: string;
  buffer: FireInstance;
  count: number;
}

export interface QuakesReadyMessage {
  kind: "QUAKES_READY";
  source: string;
  dataSource: string;
  buffer: Float32Array;
  count: number;
}

export interface WindReadyMessage {
  kind: "WIND_READY";
  source: string;
  dataSource: string;
  /** RGBA para la DataTexture del particle system. */
  buffer: Float32Array;
  count: number;
}

export interface RadiationReadyMessage {
  kind: "RADIATION_READY";
  source: string;
  dataSource: string;
  /** Siempre en µSv/h: el CPM se normaliza en el backend (SPEC, subsistema 7). */
  buffer: Float32Array;
  count: number;
}

export type WorkerRequest =
  | FiresReadyMessage
  | QuakesReadyMessage
  | WindReadyMessage
  | RadiationReadyMessage;
export type WorkerResponse = WorkerRequest;

/**
 * API que el hilo principal ve en cada worker (`wrap<WorkerApi>(worker)`,
 * TECH_STACK §2.6). `echo` es la ida y vuelta mínima de la plantilla; cada
 * worker real la sustituye por su parseo (`parseFIRMSData`, `buildOctree`…).
 */
export interface WorkerApi {
  echo(request: WorkerRequest): Promise<WorkerResponse>;
}

/**
 * Transferibles del mensaje: lo que Comlink debe mover sin copiar.
 *
 * Se transfiere el `ArrayBuffer` subyacente, no el typed array: `postMessage`
 * solo acepta `ArrayBuffer` y `MessagePort` como transferibles, y un
 * `Float32Array` sería clonado (copiado) en silencio.
 */
export function transferablesOf(message: WorkerRequest): Transferable[] {
  return [message.buffer.buffer];
}

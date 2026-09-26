/**
 * Contrato de módulo de datos (`DataModule`).
 *
 * Fuente de verdad: docs/GAIA_ROADMAP.md §Paso 0.2.4 — campos
 * `{endpoint, ttl, retention, worker, fetchRaw, normalize}`, que implementa cada
 * módulo de datos (F2-F6).
 *
 * Unidades: `ttl` en segundos (DEPLOYMENT §4.2), `retention` en días (DATABASE §4.2).
 */

import type { APIError } from "./contract";

/** Worker de cómputo que procesa el módulo (SPEC §2). */
export type DataWorkerId = 1 | 2 | 3;

/** Parámetros de consulta del módulo (`hours`, `days`, `resolution`, `lat`/`lon`…). */
export type ModuleQuery = Readonly<Record<string, string | number>>;

/** Sobre de la respuesta del backend (API_CONTRACT §2). */
export interface RawEnvelope {
  success: boolean;
  data: unknown;
  error: APIError | null;
}

export interface DataModule<T = unknown> {
  /** Ruta pública del módulo (`/api/fires`, `/api/earthquakes`…). */
  readonly endpoint: string;
  /** TTL de caché en segundos (DEPLOYMENT §4.2). */
  readonly ttl: number;
  /** Retención de persistencia en días (DATABASE §4.2). */
  readonly retention: number;
  /** Worker que normaliza/procesa los datos (SPEC §2). */
  readonly worker: DataWorkerId;
  /** Descarga el payload crudo del backend. */
  fetchRaw(query?: ModuleQuery): Promise<unknown>;
  /** Convierte el payload crudo en los ítems del módulo (contrato: `items`). */
  normalize(raw: unknown): T[];
}

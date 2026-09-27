/**
 * Módulo de prueba del contrato `DataModule` (ROADMAP 0.2.4).
 *
 * Andamiaje temporal: valida el contrato contra un endpoint real del backend sin
 * inventar ninguna fuente externa ni URL de upstream. F2 lo sustituye por el módulo
 * de incendios.
 */

import type { APIResponse } from "../contract";
import type { DataModule } from "../module";

export interface ProbeResult {
  status: string;
  redis: string;
}

export const probeModule: DataModule<ProbeResult> = {
  endpoint: "/api/health",
  ttl: 300,
  retention: 90,
  worker: 1,

  async fetchRaw() {
    // Sigo con fetch a pelo: el cliente tipado de 0.4.2 vive en
    // `frontend/src/services/api.ts` (lo fija PROJECT_STRUCTURE §5.7) y `shared`
    // no puede importarlo sin crear un ciclo de paquetes (`frontend` -> `shared`
    // -> `frontend`). Este módulo es andamiaje y lo sustituye F2.
    const res = await fetch(this.endpoint);
    return res.json();
  },

  normalize(raw) {
    const envelope = raw as APIResponse<ProbeResult>;
    if (!envelope?.success || !envelope.data) {
      throw new Error(`Módulo ${this.endpoint}: sobre de contrato inválido`);
    }
    return [envelope.data];
  },
};

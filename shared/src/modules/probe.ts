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
    // TODO(0.4.2): sustituir por el cliente API tipado (timeout + reintentos).
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

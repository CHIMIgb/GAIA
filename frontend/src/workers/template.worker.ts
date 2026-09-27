/**
 * Plantilla de worker (ROADMAP 0.4.3).
 *
 * Los workers reales son `ingestion.worker.ts` (W1), `spatial.worker.ts` (W2) y
 * `wind.worker.ts` (W3) — ver PROJECT_STRUCTURE §5.4. Este archivo solo fija el
 * esqueleto que comparten: lógica pura testeable fuera del hilo, API expuesta
 * con Comlink y Transferables de ida y vuelta.
 *
 * Se usa en producción así (TECH_STACK §2.6):
 *
 * ```typescript
 * const worker = new Worker(new URL("./workers/template.worker.ts", import.meta.url), {
 *   type: "module",
 * });
 * const api = wrap<WorkerApi>(worker);
 * ```
 */
import { expose, transfer } from "comlink";

import {
  transferablesOf,
  type WorkerApi,
  type WorkerRequest,
  type WorkerResponse,
} from "./worker.types";

/**
 * Lógica del worker, sin efectos: se testea directamente sin levantar un
 * `Worker` (TESTING §6.3).
 *
 * `transfer()` es lo que hace que el buffer llegue **sin copias**: Comlink 4.x
 * registra el objeto contra su lista de transferibles y la adjunta al
 * `postMessage` de respuesta. Sin él, el `Float32Array` viajaría clonado
 * (PROJECT_STRUCTURE §5.4 exige Transferable / zero-copy).
 */
export function createWorkerApi(): WorkerApi {
  return {
    echo(request: WorkerRequest): Promise<WorkerResponse> {
      const respuesta: WorkerResponse = { ...request };
      return Promise.resolve(transfer(respuesta, transferablesOf(respuesta)));
    },
  };
}

/**
 * `importScripts` solo existe en el scope de un worker, así que este guard no se
 * dispara al importar el módulo desde un test o desde el hilo principal.
 */
const enWorker =
  typeof (globalThis as { importScripts?: unknown }).importScripts ===
  "function";

if (enWorker) expose(createWorkerApi());

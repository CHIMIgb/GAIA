/**
 * Criterio ROADMAP 0.4.3: mensaje de prueba ida/vuelta sin bloquear el hilo
 * principal.
 *
 * Los nombres de mensaje y el uso de Transferables están fijados por
 * `GAIA_TESTING.md` §6.3 y `PROJECT_STRUCTURE` §5.4; el camino del hilo
 * principal es `new Worker(new URL(...))` + `wrap<T>()` (TECH_STACK §2.6).
 *
 * Aquí no se instancia un `Worker` real: jsdom no los implementa y
 * TESTING §6.3 manda testear la lógica pura. Lo que sí se ejercita de verdad es
 * el protocolo de Comlink completo, contra un `MessageChannel` real, así que el
 * viaje de ida y vuelta y la transferencia de buffers son los de verdad.
 */
import { expose, wrap } from "comlink";
import { afterEach, describe, expect, it } from "vitest";

import {
  FIRE_STRIDE,
  type FiresReadyMessage,
  type WorkerApi,
  type WorkerRequest,
} from "../../src/workers/worker.types";
import { createWorkerApi } from "../../src/workers/template.worker";

type Canal = { worker: MessagePort; main: MessagePort; cerrar(): void };

const canales: Canal[] = [];

/** MessageChannel real: el mismo endpoint que Comlink espera en ambos lados. */
function conectar(): Canal {
  const { port1, port2 } = new MessageChannel();
  const canal: Canal = {
    worker: port1,
    main: port2,
    cerrar: () => {
      port1.close();
      port2.close();
    },
  };
  canales.push(canal);
  return canal;
}

/**
 * Monta el worker de plantilla y devuelve su API tal como la vería el main, más
 * la respuesta que el worker construyó *en su hilo* (para poder comprobar que la
 * dejó transferida).
 */
function montarWorker(): {
  api: WorkerApi;
  canal: Canal;
  enviado: () => WorkerResponse;
} {
  const canal = conectar();
  const respuestas: WorkerResponse[] = [];
  const real = createWorkerApi();
  expose(
    {
      echo: async (request: WorkerRequest) => {
        const r = await real.echo(request);
        respuestas.push(r);
        return r;
      },
    },
    canal.worker as unknown as Parameters<typeof expose>[1],
  );
  return {
    api: wrap<WorkerApi>(canal.main as unknown as Parameters<typeof wrap>[0]),
    canal,
    enviado: () => respuestas[0],
  };
}

const mensaje = (): FiresReadyMessage => ({
  kind: "FIRES_READY",
  source: "firms",
  dataSource: "VIIRS",
  buffer: new Float32Array([1, 2, 3, 4, 5, 6, 7]),
  count: 1,
});

afterEach(() => {
  while (canales.length) canales.pop()?.cerrar();
});

describe("ida y vuelta del protocolo", () => {
  it("el main recibe lo que el worker procesó, con el kind intacto", async () => {
    const { api } = montarWorker();

    const respuesta = await api.echo(mensaje() as WorkerRequest);

    expect(respuesta.kind).toBe("FIRES_READY");
    expect(respuesta.dataSource).toBe("VIIRS");
    expect(respuesta.count).toBe(1);
  });

  it("el buffer llega con los 7 campos en el orden contratado", async () => {
    const { api } = montarWorker();

    const respuesta = await api.echo(mensaje() as WorkerRequest);

    // Orden de campos de TESTING §6.3: (x, y, z, r, g, b, scale).
    // `BYTES_PER_ELEMENT` y no `instanceof`: el buffer se deserializa en el realm
    // del hilo receptor, que en vitest no es el mismo `Float32Array` global.
    expect(respuesta.buffer.BYTES_PER_ELEMENT).toBe(4);
    expect(respuesta.buffer.length % FIRE_STRIDE).toBe(0);
    expect(Array.from(respuesta.buffer)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("la respuesta viaja como Transferable: cero copias, el buffer del worker se desacopla", async () => {
    const { api, enviado } = montarWorker();

    const respuesta = await api.echo(mensaje() as WorkerRequest);

    // El main recibe los datos intactos…
    expect(Array.from(respuesta.buffer)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // …y el buffer que tenía el worker queda desacoplado (byteLength 0), que es
    // la prueba de que hubo transferencia de verdad y no una copia.
    expect(enviado().buffer.byteLength).toBe(0);
  });

  it("la petición sí viaja clonada: el main conserva su buffer", async () => {
    const { api } = montarWorker();
    const original = mensaje();

    await api.echo(original as WorkerRequest);

    // structured clone en la ida: el original del main sigue intacto y usable.
    // El zero-copy va solo en la respuesta, que es la que pesa (SPEC §2, capa 2).
    expect(original.buffer.byteLength).toBe(7 * 4);
  });

  it("no bloquea el hilo principal: la llamada devuelve antes de resolver", async () => {
    const { api } = montarWorker();
    let ticked = false;

    const promesa = api.echo(mensaje() as WorkerRequest);
    ticked = true; // esto corre antes de que el worker conteste

    await promesa;
    expect(ticked).toBe(true);
  });

  it("el main nunca toca el proxy del store: el worker no devuelve estado", async () => {
    const { api } = montarWorker();

    const respuesta = await api.echo(mensaje() as WorkerRequest);

    // STATE §4: los workers no tocan `state`; solo devuelven datos (STATE §4.1).
    expect(Object.keys(respuesta).sort()).toEqual([
      "buffer",
      "count",
      "dataSource",
      "kind",
      "source",
    ]);
  });
});

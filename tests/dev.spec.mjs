import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMANDO_REDIS, COMANDOS, puertoAbierto } from "../scripts/dev.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("comandos de dev:all", () => {
  // El cwd del backend no es decorativo: uvicorn importa `app.main` relativo a él.
  // Heredado de la raíz, el backend no arranca.
  it("el backend sale de backend/ y el frontend de la raíz", () => {
    const backend = COMANDOS.find((c) => c.nombre === "backend");
    const frontend = COMANDOS.find((c) => c.nombre === "frontend");

    expect(backend.cwd).toBe(resolve(RAIZ, "backend"));
    expect(frontend.cwd).toBe(RAIZ);
  });

  // DEPLOYMENT §3.2 paso 1 lo fija literal; el nombre importa porque un
  // `--name` distinto deja contenedores sueltos que chocan con el puerto.
  it("el docker run de Redis es el de DEPLOYMENT §3.2", () => {
    expect(COMANDO_REDIS).toBe(
      "docker run -d --rm -p 6379:6379 --name gaia-redis redis:7-alpine",
    );
  });
});

describe("puertoAbierto", () => {
  it("detecta un puerto cerrado", async () => {
    // Puerto efímero que nadie escucha: se pide y se suelta.
    const sonda = createServer();
    const puerto = await new Promise((ok) =>
      sonda.listen(0, "127.0.0.1", () => ok(sonda.address().port)),
    );
    await new Promise((ok) => sonda.close(ok));

    expect(await puertoAbierto(puerto, "127.0.0.1", 300)).toBe(false);
  });

  it("detecta un puerto abierto", async () => {
    const sonda = createServer();
    const puerto = await new Promise((ok) =>
      sonda.listen(0, "127.0.0.1", () => ok(sonda.address().port)),
    );

    expect(await puertoAbierto(puerto)).toBe(true);
    await new Promise((ok) => sonda.close(ok));
  });
});

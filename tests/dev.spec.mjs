import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COMANDO_REDIS, COMANDOS, puertoAbierto } from "../scripts/dev.mjs";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("comandos de dev:all", () => {
  // El cwd no es decorativo: `app.main` (uvicorn) y `vite.config.ts` se resuelven
  // relativos a él, así que los dos procesos necesitan el suyo.
  it("el backend sale de backend/ y el frontend de frontend/", () => {
    const backend = COMANDOS.find((c) => c.nombre === "backend");
    const frontend = COMANDOS.find((c) => c.nombre === "frontend");

    expect(backend.cwd).toBe(resolve(RAIZ, "backend"));
    expect(frontend.cwd).toBe(resolve(RAIZ, "frontend"));
  });

  // DEPLOYMENT §3.2 paso 1 lo fija literal; el nombre importa porque un
  // `--name` distinto deja contenedores sueltos que chocan con el puerto.
  it("el docker run de Redis es el de DEPLOYMENT §3.2", () => {
    expect(COMANDO_REDIS).toBe(
      "docker run -d --rm -p 6379:6379 --name gaia-redis redis:7-alpine",
    );
  });

  // Los que fallaron al probarlo de verdad, cada uno con su razón:
  it("el frontend llama a vite directamente, no a través de npm", () => {
    const frontend = COMANDOS.find((c) => c.nombre === "frontend");

    // `npm run dev` de la raíz es `-w frontend`, y npm se queda los `--port=...`
    // en vez de pasarlos a Vite, que aborta con `Unused args`.
    expect(frontend.comando).toContain("vite");
    expect(frontend.comando).not.toContain("npm run dev");
  });

  // Sin --strictPort, un 5173 ocupado hace que Vite salte al 5174 y el mensaje de
  // "escuchando en 5173" que imprime el script sería falso.
  it("el frontend fija el puerto y no lo suelta si está ocupado", () => {
    const frontend = COMANDOS.find((c) => c.nombre === "frontend");

    expect(frontend.comando).toContain("--port 5173");
    expect(frontend.comando).toContain("--strictPort");
    // Sin --host, Vite 8 escucha solo en [::1] y curl a 127.0.0.1 da ECONNREFUSED.
    expect(frontend.comando).toContain("--host 127.0.0.1");
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

#!/usr/bin/env node
/**
 * Puesta en marcha completa con un solo comando: Redis + backend + frontend.
 *
 * No redefine `npm run dev`: ese sigue siendo solo el frontend, como fijan
 * `GAIA_CONTRIBUTING.md` §"bucle de un micro-paso" y `GAIA_DEPLOYMENT.md` §3.2
 * ("la API va aparte, en el 8000"). Este script es el atajo para levantar los tres.
 *
 * Sin dependencias nuevas: `spawn` de stdlib basta, y `scripts/` ya es el sitio de
 * los scripts de Node del repo (`check-links.mjs`, `coverage.mjs`, ...).
 *
 * PostgreSQL no se toca: `GAIA_DEPLOYMENT.md` §3.2 lo fija nativo y fuera de Docker,
 * y el backend arranca igual sin él (sin historial). Redis sí se levanta, porque sin
 * él el backend responde degradado y el rate-limit no funciona.
 */

import { spawn } from "node:child_process";
import { connect } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ES_WINDOWS = process.platform === "win32";

export const PUERTO_FRONTEND = 5173;
export const PUERTO_BACKEND = 8000;
export const PUERTO_REDIS = 6379;

/** Literal de `GAIA_DEPLOYMENT.md` §3.2 paso 1. */
export const COMANDO_REDIS = `docker run -d --rm -p ${PUERTO_REDIS}:${PUERTO_REDIS} --name gaia-redis redis:7-alpine`;

/**
 * Los dos procesos largos. El `cwd` va resuelto y no heredado del shell: uvicorn
 * necesita cwd `backend/` para encontrar `app.main`, y el frontend sale de la raíz
 * porque son workspaces.
 */
export const COMANDOS = [
  {
    nombre: "backend",
    comando: `uv run uvicorn app.main:app --reload --port ${PUERTO_BACKEND}`,
    cwd: resolve(RAIZ, "backend"),
  },
  {
    nombre: "frontend",
    // `--host 127.0.0.1` no es decorativo: sin él el dev server de Vite 8 escucha solo
    // en `[::1]`, así que `curl 127.0.0.1:5173` da ECONNREFUSED. Es lo mismo que ya
    // documenta `playwright.config.ts` para el E2E.
    //
    // `--strictPort` para que el fallo sea visible: sin él, si el 5173 está ocupado
    // Vite se salta al 5174 y el mensaje de "Listo" de arriba quedaría mintiendo.
    // `vite` y no `npm run dev`: el `npm run dev` de la raíz es `-w frontend`, y sus
    // flags `--port=...` se los queda npm en vez de pasarlos a Vite, que con Vite 8
    // aborta con `Unused args` (y npm avisa por las tres líneas de "Unknown cli
    // config"). Invocando el binario no hay capa npm que se los quite.
    //
    // `playwright.config.ts` sigue con la forma vieja `npm run dev -- --port`, que
    // aún aguanta porque su comando no pasa por el script de la raíz.
    comando: `npx vite --port ${PUERTO_FRONTEND} --host 127.0.0.1 --strictPort`,
    cwd: resolve(RAIZ, "frontend"),
  },
];

/** Sondeo TCP: decide si hay que levantar Redis. Un `fetch` no sirve, Redis no habla HTTP. */
export function puertoAbierto(puerto, host = "127.0.0.1", ms = 1000) {
  return new Promise((ok) => {
    const socket = connect({ port: puerto, host });
    let resuelto = false;
    const fin = (v) => {
      if (resuelto) return;
      resuelto = true;
      socket.destroy();
      ok(v);
    };
    socket.once("connect", () => fin(true));
    socket.once("error", () => fin(false));
    setTimeout(() => fin(false), ms).unref();
  });
}

/** El shell hace falta en Windows para resolver los `npm.cmd`/`uv.exe` del PATH. */
function lanzar({ nombre, comando, cwd }, stdio = "inherit") {
  const proc = spawn(comando, {
    cwd,
    shell: true,
    stdio,
    // Grupo propio en POSIX para poder matar el árbol entero (uvicorn --reload
    // cuelga un hijo). En Windows eso lo hace `taskkill /T`.
    detached: !ES_WINDOWS,
  });
  proc.pidNombre = nombre;
  return proc;
}

function matar(proc) {
  if (!proc || proc.exitCode !== null || proc.killed) return;
  if (ES_WINDOWS)
    spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else {
    try {
      process.kill(-proc.pid, "SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }
  }
}

const log = (msg) => console.log(`\x1b[36m[dev]\x1b[0m ${msg}`);
const aviso = (msg) => console.warn(`\x1b[33m[dev]\x1b[0m ${msg}`);

async function asegurarRedis() {
  if (await puertoAbierto(PUERTO_REDIS)) {
    log(`Redis ya responde en :${PUERTO_REDIS}, no se levanta nada.`);
    return;
  }
  log("Levantando Redis...");
  const proc = lanzar({ nombre: "redis", comando: COMANDO_REDIS });
  const codigo = await new Promise((ok) => proc.once("close", ok));
  if (codigo === 0) log(`Redis en :${PUERTO_REDIS}.`);
  else
    aviso(
      "No se pudo levantar Redis (¿Docker apagado?). Se sigue: el backend arranca " +
        "igual, pero sin caché ni rate-limit. El `docker run` está en DEPLOYMENT §3.2.",
    );
}

async function main() {
  await asegurarRedis();

  const hijos = COMANDOS.map((c) => {
    log(`${c.nombre}: ${c.comando}`);
    return lanzar(c);
  });

  let saliendo = false;
  const salir = (codigo) => {
    if (saliendo) return;
    saliendo = true;
    for (const h of hijos) matar(h);
    process.exit(codigo);
  };

  process.on("SIGINT", () => salir(0));
  process.on("SIGTERM", () => salir(0));

  // Si uno se cae, el otro se queda huérfano ocupando su puerto: mejor cortar los dos.
  for (const h of hijos) {
    h.once("close", (codigo) => {
      if (saliendo) return;
      aviso(`${h.pidNombre} terminó (código ${codigo}). Se paran los demás.`);
      // `uv` fuera del PATH es el fallo más habitual en Windows y el mensaje del
      // sistema ("no se reconoce...") no dice de qué variable se trata.
      if (h.pidNombre === "backend" && codigo !== 0) {
        aviso(
          "Si arriba dice que 'uv' no se reconoce, está instalado pero fuera del " +
            "PATH de esta terminal: reábrela tras instalarlo para el usuario.",
        );
      }
      salir(codigo ?? 1);
    });
  }

  // "Listo" solo cuando los puertos contestan de verdad. Imprimirlo al lanzar mentiría:
  // uvicorn tarda un par de segundos en abrir el 8000, y con `--strictPort` un 5173
  // ocupado sale como fallo y no como salto al 5174.
  for (const [nombre, puerto] of [
    ["frontend", PUERTO_FRONTEND],
    ["API", PUERTO_BACKEND],
  ]) {
    let listo = false;
    for (let i = 0; i < 60 && !listo && !saliendo; i++) {
      listo = await puertoAbierto(puerto, "127.0.0.1", 1000);
      if (!listo) await new Promise((r) => setTimeout(r, 1000));
    }
    if (listo) log(`${nombre} escuchando en http://localhost:${puerto}`);
    else if (!saliendo) aviso(`${nombre} no abrió el ${puerto} en 60 s.`);
  }
  if (!saliendo) log("Ctrl+C para pararlo todo.");
}

// Solo cuando se ejecuta, no cuando un test importa los helpers.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

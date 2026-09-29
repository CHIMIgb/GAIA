/**
 * Base del smoke E2E (ROADMAP 0.6.9, `docs/GAIA_TESTING.md` §7.3 y §8.1).
 *
 * - `dev` y no `preview`: el test del dato mock importa los módulos TS del propio
 *   navegador, y el server de Vite es quien los sirve.
 * - Solo Chromium: el smoke de 4 navegadores con WebGL2 (§7.3) espera al globo de F1.
 * - `webServer` con los dos procesos: el test habla con el backend real, no con un mock.
 */
import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 8000;

/**
 * Origen del backend para las peticiones de API de los tests.
 *
 * Exportado porque `use.baseURL` es el de la página (el dev server de Vite): una
 * petición de API con `baseURL` por llamada no lo pisa y `/api/health` acababa en el
 * dev server, que responde el `index.html` del SPA con un 200.
 */
export const BACKEND_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // Un fallo de red reintenta: la caída de Redis o un cold start de Vite no son fallos.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // `--host 127.0.0.1` no es decorativo: sin él el dev server de Vite 8 escucha
      // solo en `[::1]`, y la sonda de readiness va a `127.0.0.1` → ECONNREFUSED
      // hasta que se agotan los 60 s. Se vio al abrir 0.7.4: con un dev server
      // viejo reutilizado el bug pasaba desapercibido.
      command: `npm run dev -- --port ${FRONTEND_PORT} --host 127.0.0.1 --strictPort`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `uv run uvicorn app.main:app --host 127.0.0.1 --port ${BACKEND_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

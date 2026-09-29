/**
 * Config de la medición de FPS en headless (ROADMAP 0.7.15).
 *
 * Aparte de `playwright.config.ts` y de `playwright.fcp.config.ts` a propósito: el smoke
 * E2E necesita el dev server y el backend, y la medición de frames necesita el build de
 * producción servido por `vite preview`. Separate evita que cada uno arrastre el
 * `webServer` del otro. El `webServer` es el mismo que en el FCP a propósito: es el mismo
 * build, y duplicar la definición del puerto sería una segunda cosa que puede desincronizarse.
 */
import { defineConfig, devices } from "@playwright/test";

const PREVIEW_PORT = 4174;

export default defineConfig({
  testDir: "./tests/fps",
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // `--host 127.0.0.1` por el mismo motivo que en el FCP: sin él el preview escucha
      // solo en `[::1]` y la sonda de readiness, que va a `127.0.0.1`, no conecta.
      command: `npm run preview -- --port ${PREVIEW_PORT} --host 127.0.0.1 --strictPort`,
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

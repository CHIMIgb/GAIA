/**
 * Config del FCP base (ROADMAP 0.7.4).
 *
 * Aparte de `playwright.config.ts` a propósito: el smoke E2E necesita el dev server y
 * el backend, y medir el FCP sobre un dev server no mide el FCP de nada real. Aquí solo
 * se levanta `vite preview` sobre `dist/`, así que el build tiene que existir: el
 * script `npm run fcp` lo genera antes de invocar a Playwright.
 */
import { defineConfig, devices } from "@playwright/test";

const PREVIEW_PORT = 4173;

export default defineConfig({
  testDir: "./tests/fcp",
  reporter: "list",
  use: { baseURL: `http://127.0.0.1:${PREVIEW_PORT}` },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // `--host 127.0.0.1` no es decorativo: sin él el preview de Vite 8 escucha
      // solo en `[::1]` y la sonda de readiness de Playwright, que va a `127.0.0.1`,
      // no conecta nunca (60 s de timeout).
      command: `npm run preview -- --port ${PREVIEW_PORT} --host 127.0.0.1 --strictPort`,
      url: `http://127.0.0.1:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});

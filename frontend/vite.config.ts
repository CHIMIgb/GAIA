import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig } from "vitest/config";

// Reporte de tamaños por chunk (paso 0.7.6 del ROADMAP), con el criterion de
// "identificar módulos pesados": `rollup-plugin-visualizer` genera un treemap
// HTML. No se usa `size-limit`, que sí pone puertas por chunk, porque eso
// necesita cifras y las de textura/shader siguen sin existir (0.7.5 bloqueado).
//
// Va detrás de `--mode analyze` (`npm run analyze`) y no de una env var porque
// en npm scripts una env var necesita `cross-env` para dar lo mismo en Windows
// y en Linux; `--mode` ya es de Vite y cruza plataformas sin otra dependencia.
//
// Exportado para el test: el default se evalúa con `import.meta.url`, que bajo
// vitest no es un URL de fichero, así que el default no se puede invocar desde
// una unidad. Lo que se decide aquí es solo la pregunta "¿toca el reporte?".
export const pluginsDeAnalisis = (mode: string) =>
  mode === "analyze"
    ? {
        rollupOptions: {
          plugins: [
            visualizer({
              filename: "dist/stats.html",
              // Los presupuestos de `GAIA_PERFORMANCE.md` son de gzip, así que
              // el treemap enseña gzip y brotli: comparar el número grande
              // (raw) contra el presupuesto da falsos positivos.
              gzipSize: true,
              brotliSize: true,
            }),
          ],
        },
      }
    : undefined;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: pluginsDeAnalisis(mode),
  resolve: {
    alias: {
      // Mismo criterio que el `paths` de `tsconfig.app.json`: `@gaia/shared` se
      // consume como fuente y no como paquete instalado.
      "@gaia/shared": fileURLToPath(
        new URL("../shared/src/index.ts", import.meta.url),
      ),
    },
  },
  // `GAIA_TESTING.md` §6.2 fija Vitest para las unidades de frontend; jsdom solo
  // hace falta para los tests que montan componentes.
  test: {
    environment: "jsdom",
    // `e2e` queda fuera a propósito: los `.spec.ts` de Playwright los corre él
    // (`npm run test:e2e`). Sin el exclude, vitest los carga y falla con
    // "Playwright Test did not expect test() to be called here".
    include: ["tests/**/*.spec.{ts,tsx}"],
    exclude: ["tests/e2e/**", "tests/fcp/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      // `json-summary` es lo que lee `scripts/coverage.mjs` (0.7.10) para
      // atribuir cada archivo a su fase del ROADMAP. `text` lo deja legible en
      // el log de local; en CI manda el step summary.
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
}));

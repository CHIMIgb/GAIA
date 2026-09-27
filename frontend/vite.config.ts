import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    include: ["tests/**/*.spec.{ts,tsx}"],
  },
});

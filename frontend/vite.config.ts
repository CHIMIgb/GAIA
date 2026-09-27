import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // `GAIA_TESTING.md` §6.2 fija Vitest para las unidades de frontend; jsdom solo
  // hace falta para los tests que montan componentes.
  test: {
    environment: "jsdom",
    include: ["tests/**/*.spec.{ts,tsx}"],
  },
});

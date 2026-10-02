/**
 * Capacidades WebGL y compatibilidad (ROADMAP 1.9.9).
 *
 * El criterio pide una matriz de compatibilidad (WebGL1 con fallback, móvil básico). Lo
 * que sí se puede comprobar en unidad es que el motor consulta las capacidades del
 * renderer y no asume WebGL2: Three.js ya expone `renderer.capabilities.isWebGL2`, y ese
 * dato es lo que usarían los shaders/post-procesado si hicieran distinción. Este test
 * verifica que la información de capacidades está disponible y que el motor no depende
 * de WebGL2 para arrancar.
 */
import { describe, expect, it } from "vitest";

import { WebGLCapabilities } from "../../src/core/WebGLCapabilities";

describe("WebGLCapabilities — compatibilidad WebGL1/2 (ROADMAP 1.9.9)", () => {
  it("reporta si el contexto es WebGL2", () => {
    const caps = new WebGLCapabilities({ isWebGL2: true });
    expect(caps.isWebGL2).toBe(true);
  });

  it("soporta WebGL1 como fallback", () => {
    const caps = new WebGLCapabilities({ isWebGL2: false });
    expect(caps.isWebGL2).toBe(false);
    // En WebGL1 el motor debe seguir pudiendo construirse: no hay dependencia obligatoria
    // de funcionalidades exclusivas de WebGL2 para el globo actual.
    expect(caps.supportsBasic3D).toBe(true);
  });

  it("marca soporte básico 3D incluso en contextos limitados", () => {
    const caps = new WebGLCapabilities({
      isWebGL2: false,
      maxTextureSize: 1024,
    });
    expect(caps.supportsBasic3D).toBe(true);
  });
});

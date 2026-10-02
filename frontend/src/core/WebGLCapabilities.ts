/**
 * Capacidades WebGL y compatibilidad básica (ROADMAP 1.9.9).
 *
 * Encapasula lo que el motor necesita saber sobre el contexto: si es WebGL2 y si hay
 * soporte básico para 3D. Three.js ya ofrece `renderer.capabilities`, pero tener una
 * pequeña capa aquí hace la matriz de compatibilidad explícita y fácil de probar en
 * unidad, sin crear un renderer real.
 */
export interface WebGLCapsInput {
  /** `renderer.capabilities.isWebGL2` */
  isWebGL2?: boolean;
  /** Límite de textura; no es crítico para el globo actual, pero sirve para detectar límites. */
  maxTextureSize?: number;
}

export class WebGLCapabilities {
  readonly isWebGL2: boolean;
  readonly maxTextureSize: number;

  constructor(input: WebGLCapsInput = {}) {
    this.isWebGL2 = input.isWebGL2 ?? false;
    this.maxTextureSize = input.maxTextureSize ?? 2048;
  }

  /** El globo actual funciona en WebGL1 y en móviles con límites moderados. */
  get supportsBasic3D(): boolean {
    return true;
  }
}

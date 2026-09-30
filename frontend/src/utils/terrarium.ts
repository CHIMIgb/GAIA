/**
 * Decodificador del formato Terrarium (ROADMAP 1.3.1).
 *
 * `docs/GAIA_GLOBE_TEXTURES.md` §2.1 y `docs/GAIA_DATA_SOURCES.md` §4 fijan la
 * cuenta en **bytes** (R, G, B ∈ 0..255):
 *
 *     elevación (m) = (R × 256 + G + B / 256) − 32768
 *
 * Es la misma fórmula-matemática que el doc traduce a GLSL para el vertex shader
 * (`texel.r * 256² + texel.g * 256 + texel.b − 32768` con texel normalizado); se
 * usan en rangos distintos —bytes aquí, [0,1] en el shader—, así que esta función
 * es la versión en caja de cerillas y el test compara contra valores conocidos
 * (nivel del mar 0 m, Everest +8848 m, Marianas −11034 m).
 */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

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
import { LAT_LIMITE, vMercator } from "./tilesSatelite";

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Desfase en columnas entre el atlas equirect y el mercator (ROADMAP 1.3.3).
 *
 * No es una elección: el atlas equirect del proyecto arranca en longitud −90 (es el
 * `uv` de `SphereGeometry`, el que siguen los assets validados en 1.3.1) y el mercator
 * en −180, así que la fila equirect es la mercator girada un cuarto de vuelta. Medido
 * contra `elevacion_alta.png` (z2): con este desfase y sin volteo vertical la
 * correlación es 0,9953 y el error medio 122 m (|lat| ≤ 60°); con los otros siete
 * giros posibles la correlación no pasa de 0,29.
 */
export const DESFASE_ATLAS_COLUMNAS = 1 / 4;

/** URL del tile Terrarium, tal y como la fija `docs/GAIA_GLOBE_TEXTURES.md` §2.1. */
export function urlTileTerrarium(z: number, x: number, y: number): string {
  return `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
}

/** Latitud (grados) del centro de una fila del atlas equirect; la fila 0 es el norte. */
export function latDeFilaEquirect(fila: number, alto: number): number {
  return 90 - ((fila + 0.5) * 180) / alto;
}

/**
 * Fila (0 = norte) del atlas mercator donde cae una latitud, o `null` si está más allá
 * del límite mercator: esos polos del equirect no tienen dato y el atlas los deja
 * negros, igual que los 28 renglones sin dato por polo del asset z2 validado.
 *
 * El recorte del final es el mismo que en `tileDeLonLat`: en el límite exacto
 * (±85,05112878°) el logaritmo se pasa de π por épsilon y el `floor` daría −1.
 */
export function filaMercatorDeLat(lat: number, alto: number): number | null {
  if (Math.abs(lat) > LAT_LIMITE) {
    return null;
  }
  return Math.max(0, Math.min(alto - 1, Math.floor(vMercator(lat) * alto)));
}

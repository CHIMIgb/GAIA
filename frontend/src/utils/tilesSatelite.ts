/**
 * Matemática de tiles satelitales XYZ/WebMercator (ROADMAP 1.4.1).
 *
 * La textura satelital se descarga en runtime como tiles de Esri
 * (`GAIA_GLOBE_TEXTURES.md` §1.1) y se empaca en un atlas continuo que el fragment
 * shader muestrea en coordenadas mercator. Este módulo es la parte testeable sin
 * GPU: elección de nivel por distancia, tile por lat/lon y cruce entre niveles.
 *
 * La conversión mercator↔uv del shader debe repetir EXACTAMENTE esta matemática
 * (mismo patrón que `decodeTerrarium`/GLSL): aquí se valida sin navegador, el
 * shader manda en render.
 */
import {
  DISTANCIA_BASE,
  DISTANCIA_DETALLE,
} from "../modules/globe/ElevationLOD";

/** Límite del esquema XYZ: mercator no cubre los polos por encima de ±85,05°. */
export const LAT_LIMITE = 85.05112878;

/**
 * Último nivel que se sirve. Con el atlas entero por nivel (una textura por zoom), z4 es
 * el techo práctico: son 256 tiles de 256 px en un atlas 4096².
 */
export const ZOOM_MAXIMO = 4;

/**
 * Distancia de cámara (en radios) a la que entra cada nivel.
 *
 * z0–z2 heredan los umbrales del LOD de elevación de 1.3.1 (`DISTANCIA_BASE` 3.6 y
 * `DISTANCIA_DETALLE` 2.2), para que relieve y textura cambien a la vez y no haya dos
 * palancas independientes. z3 y z4 son nuevos: son los que hacen falta para el zoom de
 * contacto (la cámara baja a 1.4). Con solo z2 el atlas de 1024² se magnifica ~5× en el
 * zoom máximo y el planeta se ve borroso —el defecto que reportó el usuario—; z4 lo deja
 * casi 1:1.
 */
const UMBRAL_POR_ZOOM = [
  Number.POSITIVE_INFINITY, // z0: siempre
  DISTANCIA_BASE, // z1 (3.6) — heredado de 1.3.1
  DISTANCIA_DETALLE, // z2 (2.2) — heredado de 1.3.1
  1.9, // z3 — primer nivel de contacto
  1.65, // z4 — el más cercano; la cámara baja a 1.4
];

/**
 * Ancho de la banda de cruce: 25 % por encima del umbral, el de 1.4.1. Se recorta al
 * umbral del nivel superior para que la banda de un nivel nunca invada el terreno puro
 * del siguiente (sin el recorte, la banda de z3 —1.9×1.25=2.375— se comería el tramo
 * [2.2, 2.375) de z2).
 */
const BANDA = 1.25;

/** Fin de la banda de cruce del nivel `z`: ya dentro de su zona pura o de la del anterior. */
function bandaDe(z: number): number {
  return Math.min(UMBRAL_POR_ZOOM[z] * BANDA, UMBRAL_POR_ZOOM[z - 1]);
}

/** Nivel más detallado que ya está activo a esa distancia (el nivel puro, sin mezcla). */
export function zoomParaDistancia(distancia: number): number {
  let z = 0;
  while (z < ZOOM_MAXIMO && distancia < UMBRAL_POR_ZOOM[z + 1]) z++;
  return z;
}

/** Nº de tiles por lado en el nivel: 1 (z0), 2 (z1), 4 (z2), 8 (z3), 16 (z4). */
export function ladoDeZoom(zoom: number): number {
  return 2 ** zoom;
}

/**
 * URL documentada en `GAIA_GLOBE_TEXTURES.md` §1.1 (Esri World Imagery).
 * El orden de la plantilla es `{z}/{y}/{x}` (fila, columna), verificado en vivo.
 */
export function urlTileEsri(z: number, y: number, x: number): string {
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

/**
 * Tile XYZ (fila 0 = norte) que contiene una lat/lon en el nivel dado.
 * `x` da la vuelta al mundo; `y` se recorta al límite mercator porque el esquema
 * XYZ no tiene datos más allá de ±85,05° (los polos los estira el atlas).
 */
export function tileDeLonLat(
  lon: number,
  lat: number,
  zoom: number,
): { x: number; y: number } {
  const lado = ladoDeZoom(zoom);
  const latRecortada = Math.max(-LAT_LIMITE, Math.min(LAT_LIMITE, lat));
  const mercX = ((lon + 180) / 360) * lado;
  const latR = (latRecortada * Math.PI) / 180;
  const mercY =
    (0.5 - Math.log(Math.tan(Math.PI / 4 + latR / 2)) / (2 * Math.PI)) * lado;
  // Clamp antes del floor: en el límite exacto (85,0511°) el logaritmo puede
  // pasarse de π por épsilon y el floor saldría -1. La columna da la vuelta al
  // mundo; `% lado` en JS conserva el signo, así que el +lado lo normaliza.
  const x = ((Math.floor(mercX) % lado) + lado) % lado;
  const y = Math.max(0, Math.min(lado - 1, Math.floor(mercY)));
  return { x, y };
}

/**
 * Cruce entre niveles para que el cambio de distancia «no salte» (criterio de
 * 1.4.1): devuelve el nivel actual, el siguiente más lejano y el peso del
 * segundo, con banda de transición del 25 % por encima de cada umbral. La misma
 * regla para los cinco niveles (`bandaDe` recorta cada banda para que no se solapen).
 *
 * Ejemplo en la banda [3.6, 4.5): el nivel A es z1, el B z0 y `peso` crece de 0 a
 * 1 al alejarse, de forma que el globo se queda con z0 cuando pasa de 4.5.
 */
export function nivelesConFade(distancia: number): {
  zoomA: number;
  zoomB: number;
  peso: number;
} {
  // El nivel A es el más detallado que ya tiene banda abierta a esta distancia.
  let z = 0;
  while (z < ZOOM_MAXIMO && distancia < bandaDe(z + 1)) z++;
  if (z === 0 || distancia < UMBRAL_POR_ZOOM[z])
    return { zoomA: z, zoomB: z, peso: 0 };
  const banda = bandaDe(z);
  return {
    zoomA: z,
    zoomB: z - 1,
    peso: (distancia - UMBRAL_POR_ZOOM[z]) / (banda - UMBRAL_POR_ZOOM[z]),
  };
}

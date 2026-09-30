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

/** Nº de tiles por lado en el nivel: 1 (z0), 2 (z1), 4 (z2). */
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
 * Nivel por distancia de cámara, alineado con el LOD de elevación (1.3.1): la
 * misma `DISTANCIA_DETALLE` 2.2 y `DISTANCIA_BASE` 3.6 radios. Así el detalle
 * satelital cambia a la vez que el DEM, no hay dos palancas independientes.
 */
export function zoomParaDistancia(distancia: number): number {
  if (distancia < DISTANCIA_DETALLE) return 2;
  if (distancia < DISTANCIA_BASE) return 1;
  return 0;
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
 * segundo, con banda de transición del 25 % por encima de cada umbral.
 *
 * Ejemplo en la banda [3.6, 4.5): el nivel A es z1, el B z0 y `peso` crece de 0 a
 * 1 al alejarse, de forma que el globo se queda con z0 cuando pasa de 4.5.
 */
export function nivelesConFade(distancia: number): {
  zoomA: number;
  zoomB: number;
  peso: number;
} {
  if (distancia < DISTANCIA_DETALLE) return { zoomA: 2, zoomB: 2, peso: 0 };
  const bandaIzq = DISTANCIA_DETALLE * 1.25;
  if (distancia < bandaIzq)
    return {
      zoomA: 2,
      zoomB: 1,
      peso: (distancia - DISTANCIA_DETALLE) / (bandaIzq - DISTANCIA_DETALLE),
    };
  if (distancia < DISTANCIA_BASE) return { zoomA: 1, zoomB: 1, peso: 0 };
  const bandaBase = DISTANCIA_BASE * 1.25;
  if (distancia < bandaBase)
    return {
      zoomA: 1,
      zoomB: 0,
      peso: (distancia - DISTANCIA_BASE) / (bandaBase - DISTANCIA_BASE),
    };
  return { zoomA: 0, zoomB: 0, peso: 0 };
}

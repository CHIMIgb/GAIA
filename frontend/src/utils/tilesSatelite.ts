/**
 * Matemática de tiles satelitales XYZ/WebMercator (ROADMAP 1.4.1).
 *
 * La textura satelital se descarga en runtime como tiles de Esri
 * (`GAIA_GLOBE_TEXTURES.md` §1.1) y se empaca en un atlas continuo que el fragment
 * shader muestrea en coordenadas mercator. Este módulo es la parte testeable sin
 * GPU: elección de nivel por distancia, tile por lat/lon, cruce entre niveles y el
 * rectángulo de tiles que cubre la pantalla (atlas de vista).
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
 * Un nivel de la escalera de textura: a qué distancia de cámara entra y si su atlas es
 * del mundo entero (`cap: false`) o solo del rectángulo que se ve (`cap: true`).
 */
interface EntradaNivel {
  readonly nivel: number;
  readonly umbral: number;
  readonly cap: boolean;
}

/**
 * Escalera de niveles de textura (ROADMAP 1.4.1).
 *
 * z0–z2 heredan los umbrales del LOD de elevación de 1.3.1 (`DISTANCIA_BASE` 3.6 y
 * `DISTANCIA_DETALLE` 2.2), para que relieve y textura cambien a la vez y no haya dos
 * palancas independientes. z3 y z4 son de contacto con atlas del mundo entero (64 y 256
 * tiles). z6 es el primero de **atlas de vista** (`cap`): con un atlas por nivel, z4 ya
 * es el techo —256 tiles en un atlas 4096²— y en el zoom máximo (cámara a 1.4 radios) la
 * pantalla magnifica ese atlas ~3× y el planeta se ve borroso. Un atlas del mundo entero
 * en z6 serían 4096 tiles y una textura 16384² (1 GB): inviable. De z6 en adelante solo
 * se descargan los tiles del rectángulo que la cámara está viendo (`rectDeCap`), que a
 * la vez son los que dan la nitidez del contacto.
 */
const ESCALERA: readonly EntradaNivel[] = [
  { nivel: 0, umbral: Number.POSITIVE_INFINITY, cap: false }, // z0: siempre
  { nivel: 1, umbral: DISTANCIA_BASE, cap: false }, // z1 (3.6) — heredado de 1.3.1
  { nivel: 2, umbral: DISTANCIA_DETALLE, cap: false }, // z2 (2.2) — heredado de 1.3.1
  { nivel: 3, umbral: 1.9, cap: false }, // z3 — primer nivel de contacto
  { nivel: 4, umbral: 1.65, cap: false }, // z4 — contacto, atlas 4096²
  { nivel: 6, umbral: 1.5, cap: true }, // z6 — atlas de vista, nitidez del contacto
];

/**
 * Ancho de la banda de cruce: 25 % por encima del umbral, el de 1.4.1. Se recorta al
 * umbral de la entrada anterior para que la banda de un nivel nunca invada el terreno puro
 * del siguiente (sin el recorte, la banda de z3 —1.9×1.25=2.375— se comería el tramo
 * [2.2, 2.375) de z2).
 */
const BANDA = 1.25;

/** Fin de la banda de cruce de la entrada `indice`: su zona pura o la de la anterior. */
function bandaDe(indice: number): number {
  return Math.min(ESCALERA[indice].umbral * BANDA, ESCALERA[indice - 1].umbral);
}

/** Nivel más detallado que ya está activo a esa distancia (el nivel puro, sin mezcla). */
export function zoomParaDistancia(distancia: number): number {
  let i = 0;
  while (i + 1 < ESCALERA.length && distancia < ESCALERA[i + 1].umbral) i++;
  return ESCALERA[i].nivel;
}

/** Si el nivel está en la escalera (y por tanto se puede pedir). */
export function estaEnEscalera(zoom: number): boolean {
  return ESCALERA.some((e) => e.nivel === zoom);
}

/** Si el nivel se sirve como atlas de vista (solo el rectángulo que se ve) y no global. */
export function esCap(zoom: number): boolean {
  return ESCALERA.some((e) => e.nivel === zoom && e.cap);
}

/** Nº de tiles por lado en el nivel: 1 (z0), 2 (z1), 4 (z2), 8 (z3), 16 (z4), 64 (z6). */
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
 * v mercator (0 = norte, 1 = sur) de una latitud en grados, con la misma fórmula que el
 * fragment shader. La latitud se recorta al límite mercator porque más allá no hay datos.
 */
export function vMercator(latGrados: number): number {
  const lat =
    (Math.max(-LAT_LIMITE, Math.min(LAT_LIMITE, latGrados)) * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + lat / 2)) / (2 * Math.PI);
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
  const mercX = ((lon + 180) / 360) * lado;
  // Clamp antes del floor: en el límite exacto (85,0511°) el logaritmo puede
  // pasarse de π por épsilon y el floor saldría -1. La columna da la vuelta al
  // mundo; `% lado` en JS conserva el signo, así que el +lado lo normaliza.
  const x = ((Math.floor(mercX) % lado) + lado) % lado;
  const y = Math.max(0, Math.min(lado - 1, Math.floor(vMercator(lat) * lado)));
  return { x, y };
}

/**
 * Cruce entre niveles para que el cambio de distancia «no salte» (criterio de
 * 1.4.1): devuelve el nivel actual, el siguiente más lejano y el peso del
 * segundo, con banda de transición del 25 % por encima de cada umbral. La misma
 * regla para todos los niveles (`bandaDe` recorta cada banda para que no se solapen).
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
  let i = 0;
  while (i + 1 < ESCALERA.length && distancia < bandaDe(i + 1)) i++;
  const actual = ESCALERA[i];
  if (i === 0 || distancia < actual.umbral)
    return { zoomA: actual.nivel, zoomB: actual.nivel, peso: 0 };
  const banda = bandaDe(i);
  return {
    zoomA: actual.nivel,
    zoomB: ESCALERA[i - 1].nivel,
    peso: (distancia - actual.umbral) / (banda - actual.umbral),
  };
}

/**
 * Punto de la superficie que la cámara tiene debajo (el centro de la vista): lat/lon del
 * vector de posición de la cámara. Es el centro del rectángulo del atlas de vista.
 */
export function centroVista(
  x: number,
  y: number,
  z: number,
): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z);
  return {
    lat: (Math.asin(y / r) * 180) / Math.PI,
    lon: (Math.atan2(x, z) * 180) / Math.PI,
  };
}

/**
 * Grados de arco de superficie que ocupa media pantalla a `distancia` radios, con un
 * medio campo de visión de `medioFovGrados`.
 *
 * Un punto de la superficie a un ángulo θ del punto que la cámara tiene debajo se ve con
 * un ángulo α en la cámara, y de la ley del coseno en el triángulo cámara–centro–punto
 * sale `cos α = (d − cos θ) / √(d² + 1 − 2d·cos θ)`. Despejando θ queda la fórmula de
 * abajo. Si el discriminante sale negativo, la pantalla ya abarca el limbo del globo y el
 * arco visible es la media esfera (90°), que es justo el caso en que un atlas del mundo
 * entero (z0–z4) es lo que corresponde.
 */
export function arcoEnPantalla(
  distancia: number,
  medioFovGrados: number,
): number {
  const c = Math.cos((medioFovGrados * Math.PI) / 180);
  const k = 1 - c * c;
  const libre = 1 - k * distancia * distancia;
  const cosTheta = libre > 0 ? distancia * k + c * Math.sqrt(libre) : 0;
  return (Math.acos(Math.max(-1, Math.min(1, cosTheta))) * 180) / Math.PI;
}

/**
 * Rectángulo de tiles del atlas de vista, en coordenadas del nivel `z`: cubre la pantalla
 * alrededor del punto que la cámara tiene debajo, con `MARGEN_CAP` tiles de holgura por
 * lado para que aguante un pan antes de tener que recomponerse.
 *
 * El marco de la pantalla no es cuadrado (con 16:9 y fov 45° abarca ~78° de longitud y
 * ~20° de latitud en el zoom de contacto), así que el rectángulo tampoco: sale un atlas
 * apaisado, que es justo lo que abarata el nivel —en z6 son unas decenas de tiles en vez
 * de los 4096 del mundo entero—. La holgura vertical se mide en coordenadas mercator
 * (vMercator) porque la proyección no es lineal con la latitud, y que se estire cerca de
 * los polos es justo lo que salva a la resolución.
 */
export interface RectCap {
  readonly z: number;
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
}

/** Tiles de holgura a cada lado del rectángulo de vista. */
const MARGEN_CAP = 2;

/** Techo por eje: 16 tiles de 256 px = 4096 px, un tamaño de textura cómodo y acotado. */
const LADO_MAX_CAP = 16;

/** Rectángulo de vista del nivel `z` para una cámara en `distancia` radios. */
export function rectDeCap(
  z: number,
  centro: { lat: number; lon: number },
  distancia: number,
  medioFovVerticalGrados: number,
  aspecto: number,
): RectCap {
  const lado = ladoDeZoom(z);
  const techo = Math.min(LADO_MAX_CAP, lado);
  // El medio fov horizontal sale del vertical y del aspecto: el marco es más ancho que
  // alto, y el rectángulo de tiles debe reflejarlo en vez de salir cuadrado.
  const medioFovHorizontalGrados =
    (Math.atan(Math.tan((medioFovVerticalGrados * Math.PI) / 180) * aspecto) *
      180) /
    Math.PI;
  const semiHorizontal = arcoEnPantalla(distancia, medioFovHorizontalGrados);
  const semiVertical = arcoEnPantalla(distancia, medioFovVerticalGrados);
  const cols = Math.min(
    techo,
    Math.ceil((2 * semiHorizontal * lado) / 360) + 2 * MARGEN_CAP,
  );
  const filasPorVertical =
    2 *
    Math.abs(vMercator(centro.lat + semiVertical) - vMercator(centro.lat)) *
    lado;
  const rows = Math.min(techo, Math.ceil(filasPorVertical) + 2 * MARGEN_CAP);
  const centroTile = tileDeLonLat(centro.lon, centro.lat, z);
  return {
    z,
    x0: (((centroTile.x - Math.floor(cols / 2)) % lado) + lado) % lado,
    y0: Math.max(0, Math.min(lado - rows, centroTile.y - Math.floor(rows / 2))),
    cols,
    rows,
  };
}

/** Rectángulo mercator (u0, v0, ancho, alto) que ocupa el atlas del cap. */
export function uvDeCap(rect: RectCap): {
  u0: number;
  v0: number;
  ancho: number;
  alto: number;
} {
  const lado = ladoDeZoom(rect.z);
  return {
    u0: rect.x0 / lado,
    v0: rect.y0 / lado,
    ancho: rect.cols / lado,
    alto: rect.rows / lado,
  };
}

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
 * (misma fórmula en TS y en el fragment shader): aquí se valida sin navegador, el
 * shader manda en render.
 */
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
 * El orden es de más lejano a más cercano y el `umbral` de cada entrada es la distancia a
 * partir de la cual el nivel **siguiente** (más detallado) toma el relevo: z0 cubre todo,
 * z1 hasta `1,25 × 5,6`, z2 hasta `1,25 × 4,5`, y así hacia dentro. O sea: el nivel `i`
 * sirve en `[umbral(i+1), umbral(i) × 1,25)`, con la banda de cruce del 25 % de `bandaDe`
 * (más abajo) mordiendo el final de su tramo.
 *
 * Los umbrales salen de la nitidez, no de la costumbre. El disco del globo necesita en el
 * centro de la imagen unos `altoPx / (2 · arco(1°))` píxeles por grado —9 en un lienzo de
 * 800 px de alto— y un atlas de nivel `z` da `256 · 2^z / 360` (z4 = 11,4; z3 = 5,7;
 * z2 = 2,8; z1 = 1,4). De ahí que:
 *
 * - **z4 es el nivel del encuadre de arranque.** El encuadre del planeta entero
 *   (`distanciaDeEncuadre` en `CameraController`) cae en 2,83–2,92, y a 2,9 el disco pide
 *   8,9 px/grado: z1 o z2 (que es lo que mandaba antes) dejaban el planeta borroso de salida,
 *   que es lo que reportó el usuario. Con z4 sobra densidad incluso en el tramo de su
 *   banda. Por debajo de 2,5 el rectángulo de vista se come los polos y el cap lo sustituye.
 * - **z6 es el primer atlas de vista** (`cap`): un atlas del mundo entero en z6 serían
 *   4096 tiles y una textura 16384² (1 GB), inviable; de z6 en adelante solo se descargan
 *   los tiles del rectángulo que la cámara está viendo (`rectDeCap`), y su nivel sale del
 *   propio presupuesto (`zoomDeCap`) en vez de de un atlas fijo.
 *
 * ponytail: los umbrales son propios de la textura, no los del LOD de elevación que
 * hubo hasta 1.3.3 (revertido): la nitidez tiene su propio techo (un atlas global de z4
 * son 256 tiles y 67 MB, y en vertical un atlas z5 son 268 MB), así que atarla a unas
 * bandas ajenas dejaba la textura corta de densidad justo en el encuadre.
 */
const ESCALERA: readonly EntradaNivel[] = [
  { nivel: 0, umbral: Number.POSITIVE_INFINITY, cap: false }, // z0: siempre
  { nivel: 1, umbral: 5.6, cap: false }, // z1 (512²) — cubo lejano
  { nivel: 2, umbral: 4.5, cap: false }, // z2 (1024²)
  { nivel: 3, umbral: 3.4, cap: false }, // z3 (2048²)
  { nivel: 4, umbral: 2.8, cap: false }, // z4 (4096²) — nivel del encuadre de arranque
  { nivel: 6, umbral: 2, cap: true }, // atlas de vista desde 2,5 (relé del cap)
];

/**
 * Ancho de la banda de cruce: 25 % por encima del umbral, el de 1.4.1. Se recorta al
 * umbral de la entrada anterior para que la banda de un nivel nunca invada el terreno puro
 * del siguiente (sin el recorte, la banda de z3 —3,4×1,25=4,25— se comería el tramo
 * [4,5; 5,6) de z2).
 */
const BANDA = 1.25;

/** Fin de la banda de cruce de la entrada `indice`: su zona pura o la de la anterior. */
function bandaDe(indice: number): number {
  return Math.min(ESCALERA[indice].umbral * BANDA, ESCALERA[indice - 1].umbral);
}

/** Nivel más detallado que ya está activo a esa distancia (el nivel puro, sin mezcla). */
export function zoomParaDistancia(distancia: number): number {
  // Misma selección que `nivelesConFade`: si vivieran separadas acabarían discrepando
  // justo en las bandas de cruce, que es donde importa.
  return nivelesConFade(distancia).zoomA;
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
 * El marco de la pantalla no es cuadrado (con 16:9 y fov 45° abarca ~39,5° de longitud
 * y ~19,8° de latitud en el zoom de contacto), así que el rectángulo tampoco: sale un
 * atlas apaisado, que es justo lo que abarata el nivel —en z6 son unas decenas de tiles
 * en vez de los 4096 del mundo entero—. La holgura vertical se mide en coordenadas mercator
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

/**
 * Rango del atlas de vista. z6 es el que entra por el umbral de la escalera; el nivel
 * concreto lo elige `zoomDeCap` según lo que quepa, y puede bajar a z5 (tiles de 512 px
 * necesitan un nivel menos para la misma densidad) pero nunca sube de z8.
 *
 * ponytail: el techo es el atlas, no el zoom. z7 en el contacto (cámara a 1.4 radios,
 * fov 45, 16:9) necesita un rectángulo de 19×12 tiles de 256 px, o sea 4864×3072 px
 * (~57 MB de VRAM) para los 91 px/grado que pide un DPR 2. z8 pediría 6144×4864 (~114 MB)
 * y se acerca al `maxTextureSize` de las GPUs, así que no entra. Subir `PXS_MAX_CAP` es el
 * ajuste si se acepta ese coste.
 */
export const ZOOM_CAP_MINIMO = 5;
export const ZOOM_CAP_MAXIMO = 8;

/** Techo del atlas de vista por eje: 24 tiles de 256 px (6144 px) y 6144 px de textura. */
export const LADO_MAX_CAP = 24;
export const PXS_MAX_CAP = 6144;

/**
 * Tamaño del rectángulo de vista *sin recortar*: cuántos tiles de `z` hay que bajar para
 * tapar el marco más la holgura. Es lo que decide si un nivel entra en el atlas; el
 * recorte a `LADO_MAX_CAP` de `rectDeCap` es solo la red de seguridad para los polos.
 */
function medirCap(
  z: number,
  centro: { lat: number; lon: number },
  distancia: number,
  medioFovVerticalGrados: number,
  aspecto: number,
): { cols: number; rows: number } {
  const lado = ladoDeZoom(z);
  // El medio fov horizontal sale del vertical y del aspecto: el marco es más ancho que
  // alto, y el rectángulo de tiles debe reflejarlo en vez de salir cuadrado.
  const medioFovHorizontalGrados =
    (Math.atan(Math.tan((medioFovVerticalGrados * Math.PI) / 180) * aspecto) *
      180) /
    Math.PI;
  const semiHorizontal = arcoEnPantalla(distancia, medioFovHorizontalGrados);
  const semiVertical = arcoEnPantalla(distancia, medioFovVerticalGrados);
  const filasPorVertical =
    2 *
    Math.abs(vMercator(centro.lat + semiVertical) - vMercator(centro.lat)) *
    lado;
  return {
    cols: Math.ceil((2 * semiHorizontal * lado) / 360) + 2 * MARGEN_CAP,
    rows: Math.ceil(filasPorVertical) + 2 * MARGEN_CAP,
  };
}

/**
 * Nivel del atlas de vista: el más detallado cuyo rectángulo quepa en el atlas, o `null`
 * si ninguno cabe (entonces no hay atlas de vista y se pinta con el global, que es lo que
 * ya sabe hacer `TileManager` sin cap).
 *
 * El nivel sube conforme la cámara se acerca (más cerca, menos grados que cubrir) y es lo
 * que hace que el contacto no se vea borroso: a 1.4 radios con tiles de 256 px salen z7
 * (91 px/grado) y a 1.65 radios, con el marco mucho más abierto, solo cabe z6. Con tiles de
 * 512 px el mismo atlas alcanza la misma densidad un nivel más abajo, porque lo que manda
 * es el ancho del tile, no su número.
 */
export function zoomDeCap(
  centro: { lat: number; lon: number },
  distancia: number,
  medioFovVerticalGrados: number,
  aspecto: number,
  pxTile: number,
): number | null {
  for (let z = ZOOM_CAP_MAXIMO; z >= ZOOM_CAP_MINIMO; z--) {
    const { cols, rows } = medirCap(
      z,
      centro,
      distancia,
      medioFovVerticalGrados,
      aspecto,
    );
    if (
      cols <= LADO_MAX_CAP &&
      rows <= LADO_MAX_CAP &&
      cols * pxTile <= PXS_MAX_CAP &&
      rows * pxTile <= PXS_MAX_CAP
    )
      return z;
  }
  return null;
}

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
  const medido = medirCap(
    z,
    centro,
    distancia,
    medioFovVerticalGrados,
    aspecto,
  );
  const cols = Math.min(techo, medido.cols);
  const rows = Math.min(techo, medido.rows);
  const centroTile = tileDeLonLat(centro.lon, centro.lat, z);
  return {
    z,
    x0: (((centroTile.x - Math.floor(cols / 2)) % lado) + lado) % lado,
    y0: Math.max(0, Math.min(lado - rows, centroTile.y - Math.floor(rows / 2))),
    cols,
    rows,
  };
}

/** Rectángulo mercator (u0, v0, ancho, alto) que ocupa un atlas, en 0..1. */
export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly ancho: number;
  readonly alto: number;
}

/** Rectángulo mercator (u0, v0, ancho, alto) que ocupa el atlas del cap. */
export function uvDeCap(rect: RectCap): UvRect {
  const lado = ladoDeZoom(rect.z);
  return {
    u0: rect.x0 / lado,
    v0: rect.y0 / lado,
    ancho: rect.cols / lado,
    alto: rect.rows / lado,
  };
}

/**
 * Columna del atlas donde va el tile `x` de un atlas que arranca en la columna `x0`
 * del nivel. Es el espejo CPU del `drawImage` de `TileManager` (misma fórmula en TS y
 * en el compositor), y existe por 1.4.2: el rectángulo de vista puede cruzar el
 * antimeridiano, así que sus últimas columnas son las columnas 0, 1, 2… del nivel y
 * `x - x0` sale negativo —el tile se dibujaría fuera del lienzo y dejaría un hueco en
 * el atlas—.
 *
 * El módulo es el lado del nivel, no el número de columnas del atlas: la vuelta es por
 * el mundo (2^z), no por el atlas. Con `x0=58` y 12 columnas en z6, el tile `x=0` es
 * la sexta del atlas, no la segunda.
 */
export function columnaDeAtlas(x: number, x0: number, lado: number): number {
  return (((x - x0) % lado) + lado) % lado;
}

/**
 * UV local del atlas para un punto mercator, o `null` si el punto cae fuera del
 * rectángulo (el shader entonces pinta el atlas global, que sí cubre el mundo entero).
 *
 * Es el espejo exacto del muestreo del atlas de vista en el fragment shader
 * (`AtmosphereMesh`), que es donde manda en render. Existe por 1.4.2: como el
 * rectángulo de vista puede cruzar el antimeridiano, `u0 + ancho` pasa de 1 y su mitad
 * envuelta —los puntos con `u < u0`— sigue siendo del rectángulo. Sin esa vuelta, esas
 * columnas, que el atlas sí trae en su orden, se pintaban con el atlas global y el
 * borde fecha quedaba con un escalón de nitidez en mitad de la vista.
 *
 * En `v` no hay vuelta: la latitud no es periódica y `rectDeCap` ya recorta el alto al
 * nivel, así que el ecuador y los polos entran y salen por la misma regla que el resto.
 */
export function uvLocal(
  merc: { readonly u: number; readonly v: number },
  rect: UvRect,
): { readonly u: number; readonly v: number } | null {
  const du =
    rect.u0 + rect.ancho > 1 && merc.u < rect.u0
      ? merc.u + 1 - rect.u0
      : merc.u - rect.u0;
  const dv = merc.v - rect.v0;
  return du >= 0 && du <= rect.ancho && dv >= 0 && dv <= rect.alto
    ? { u: du / rect.ancho, v: dv / rect.alto }
    : null;
}

/**
 * Descarga y caché de tiles satelitales Esri (ROADMAP 1.4.1).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 lo nombra como "Descarga y caché de tiles
 * satelitales (Esri)" y `GAIA_GLOBE_TEXTURES.md` §1.1 da la URL
 * (verificada en vivo: responde 200 JPEG). Decisión de 1.4.1, consultada: tiles
 * en runtime, siguiendo los docs.
 *
 * Cómo se pinta sin romper el único draw call de 1.2.2/1.3:
 *
 * - Cada nivel (z0-vista global 1 tile, z1-continental 4, z2-regional 16, z3 y z4 de
 *   contacto con 64 y 256) se descarga completo —"todo o nada": si falta un tile el
 *   nivel no se activa y el globo se queda con el anterior o con el color base— y se
 *   EMPACA en un atlas cuadrado continuo (256×lado). El atlas es exactamente la
 *   proyección mercator del mundo cosida de tiles contiguos, así que el fragment shader lo
 *   muestrea con la propia coordenada mercator: sin meshes por tile, sin costura
 *   entre tiles (la única posible es la del borde fecha, que es a lo que mira
 *   1.4.2), y un solo `sampler2D` por nivel.
 * - Los tres niveles base (z0-z2, 21 tiles, ~250 KB) se precargan en segundo plano al
 *   arrancar: el cambio de distancia entre ellos es instantáneo. z3 y z4 son 64 y 256
 *   tiles, así que NO se precargan: se piden en `sincronizar` cuando la cámara se acerca
 *   (z3 al pasar de 1.9 radios, z4 al pasar de 1.65).
 * - **El nivel z6 es un atlas de vista**, no del mundo entero: un atlas global en z6 serían
 *   4096 tiles y una textura 16384² (1 GB), y con solo z4 el atlas se magnifica ~6× en el
 *   contacto (cámara a 1.4 radios), que es el defecto que reportó el usuario de "todo
 *   sigue borroso". De z6 solo se baja el rectángulo de tiles que la pantalla está viendo
 *   (`rectDeCap`: 96 tiles en un atlas 3072×2048 en el zoom de contacto) y su rectángulo
 *   mercator viaja al uniform `u_rectA`, con el que el shader sabe qué parte del atlas es
 *   real. Fuera de él (o mientras el cap viejo se recompone) se pinta el atlas global más
 *   detallado que haya, que sí cubre el mundo entero. Así z6 es 4× más nítido que z4 con
 *   menos tiles que z4.
 * - El cruce entre niveles va con un fade (uniform `u_cruce`), que es el "sin saltos de
 *   textura evidentes" del criterio: el cap de z6 se funde con z4 en su banda [1.5, 1.65).
 *
 * El `cargarImagen`/`componerAtlas`/`url` van inyectados para poder probar el
 * cableado sin red ni canvas 2D; los defaults son la implementación de producción.
 */
import {
  CanvasTexture,
  LinearFilter,
  type ShaderMaterial,
  type Texture,
  type Vector3,
} from "three";

import {
  centroVista,
  columnaDeAtlas,
  esCap,
  estaEnEscalera,
  ladoDeZoom,
  nivelesConFade,
  rectDeCap,
  type RectCap,
  urlTileEsri,
  uvDeCap,
  zoomDeCap,
} from "../../utils/tilesSatelite";

/** Clave de caché de un tile; `z/y/x`, el mismo orden que la plantilla de la URL. */
const claveTile = (z: number, x: number, y: number) => `${z}/${y}/${x}`;

/** Clave del rectángulo de vista, para no recomponerlo mientras siga cubriendo la vista. */
const claveCap = (r: RectCap) => `${r.z}/${r.x0}/${r.y0}/${r.cols}x${r.rows}`;

/** Píxeles por lado de un tile Esri (GAIA_GLOBE_TEXTURES §1.1: 256×256). */
const PX_TILE = 256;

/** Rectángulo mercator del mundo entero: el caso de los atlas globales z0-z4. */
const MUNDO_ENTERO = { u0: 0, v0: 0, ancho: 1, alto: 1 };

/** Ordena claves de un rectángulo por distancia al centro (más cerca primero). */
const ordenarPorCercania = (
  z: number,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
): string[] => {
  const centroCol = (cols - 1) / 2;
  const centroFila = (rows - 1) / 2;
  const lado = ladoDeZoom(z);
  const claves: Array<{ clave: string; d2: number }> = [];
  for (let fila = 0; fila < rows; fila++) {
    for (let col = 0; col < cols; col++) {
      const x = (x0 + col) % lado;
      const dx = col - centroCol;
      const dy = fila - centroFila;
      claves.push({ clave: claveTile(z, x, y0 + fila), d2: dx * dx + dy * dy });
    }
  }
  return claves.sort((a, b) => a.d2 - b.d2).map((k) => k.clave);
};

/**
 * Tiles en vuelo a la vez. De uno en uno, los 256 de z4 serían 256 viajes de ida y
 * vuelta; el proveedor aguanta bien este paralelismo y el tiempo cae a una fracción.
 */
const TILES_POR_LOTE = 12;

/**
 * Intentos por tile antes de dar el nivel por perdido. El "todo o nada" de 1.4.1 es
 * correcto con 16 tiles, pero con 256 de z4 es casi seguro que uno se encuentre con
 * una respuesta del CDN sin cabeceras CORS (lo encontró la verificación en
 * navegador: un 429/5xx aislado tumba el nivel entero). Con un reintento por tile se
 * recupera casi siempre, y además solo se vuelve a pedir el que faltaba: los otros 255
 * ya están en caché y no se redescargan.
 */
const INTENTOS_POR_TILE = 2;

/** Pausa entre los intentos de un mismo tile. */
const ESPERA_ENTRE_INTENTOS_MS = 300;

/**
 * Espera tras perder un nivel. Sin ella, como los niveles se piden por frame (y no
 * solo en la precarga), un nivel que falló se volvería a lanzar en el frame siguiente
 * para siempre: 256 peticiones cada 16 ms contra el proveedor.
 */
const ESPERA_REINTENTO_MS = 30_000;

const esperar = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Desde este nivel los tiles sueltos no se cachean: el atlas ya guarda todos los
 * píxeles y no se vuelve a componer, así que mantener los `ImageBitmap` solo gasta
 * memoria (z4: 67 MB, el doble de lo que ocupa la textura).
 */
const NIVEL_SIN_CACHE = 3;

/**
 * Lo mínimo de la cámara que necesita el atlas de vista. `PerspectiveCamera` lo cumple
 * tal cual; el `fov` es el vertical (45° en `Engine`) y el `aspecto`, el del viewport.
 */
export interface VistaCamara {
  position: Vector3;
  fov?: number;
  aspect?: number;
}

const cargarImagenProd = async (url: string): Promise<ImageBitmap> => {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`tile Esri HTTP ${respuesta.status}`);
  return createImageBitmap(await respuesta.blob());
};

/**
 * Empaqueta los tiles en un atlas `cols×rows`. `x0`/`y0` son la columna y la fila del
 * nivel donde arranca el atlas: 0 en los atlas globales (que cubren el mundo entero) y
 * el origen del rectángulo de vista en el cap, que solo cubre una región.
 */
const componerAtlasProd = (
  tiles: Map<string, ImageBitmap>,
  cols: number,
  rows: number,
  x0 = 0,
  y0 = 0,
  pxTile = PX_TILE,
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = cols * pxTile;
  canvas.height = rows * pxTile;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2D para el atlas");
  // La fila 0 del esquema XYZ es el norte y el canvas dibuja fila 0 arriba:
  // el atlas queda en la misma orientación que muestrea el shader.
  for (const [clave, imagen] of tiles) {
    const [z, y, x] = clave.split("/").map(Number);
    // `columnaDeAtlas` (1.4.2) y no `x - x0`: si el cap cruza el antimeridiano, sus
    // últimas columnas son las columnas 0, 1, 2… del nivel y `x - x0` las dibujaría
    // fuera del lienzo, dejando huecos. La vuelta es por el mundo entero, así que el
    // periodo sale del `z` de la propia clave.
    ctx.drawImage(
      imagen,
      columnaDeAtlas(x, x0, ladoDeZoom(z)) * pxTile,
      (y - y0) * pxTile,
    );
  }
  return canvas;
};

export interface TileManagerDeps {
  cargarImagen: (url: string) => Promise<ImageBitmap>;
  componerAtlas: (
    tiles: Map<string, ImageBitmap>,
    cols: number,
    rows: number,
    x0?: number,
    y0?: number,
    pxTile?: number,
  ) => HTMLCanvasElement;
  /** Píxeles por tile de la fuente del atlas de vista (256 en Esri, 512 en MapTiler). */
  pxTile?: number;
  url: (z: number, y: number, x: number) => string;
}

export class TileManager {
  private readonly material: ShaderMaterial;
  private readonly deps: TileManagerDeps;
  private readonly tiles = new Map<string, ImageBitmap>();
  private readonly atlases = new Map<number, Texture>();
  private readonly enCurso = new Set<number>();
  /** Momento (ms) en que cada nivel se perdió, para no reintentarlo cada frame. */
  private readonly perdidos = new Map<number, number>();
  /** Atlas de vista vigente: su rectángulo y su textura. Uno solo, el último aplicado. */
  private cap: { rect: RectCap; textura: Texture } | null = null;
  /** Ancho en píxeles de un tile de la fuente del atlas de vista. */
  private readonly pxTile: number;
  private capEnCurso: string | null = null;
  private capPerdido: { clave: string; momento: number } | null = null;
  private suelto = false;

  constructor(material: ShaderMaterial, deps?: Partial<TileManagerDeps>) {
    this.material = material;
    this.deps = {
      cargarImagen: cargarImagenProd,
      componerAtlas: componerAtlasProd,
      url: urlTileEsri,
      ...deps,
    };
    this.pxTile = deps?.pxTile ?? PX_TILE;
  }

  /** Prepara los tres niveles base en segundo plano (1 + 4 + 16 tiles). Idempotente. */
  async precargar(): Promise<void> {
    for (const zoom of [0, 1, 2]) {
      await this.asegurarNivel(zoom);
    }
  }

  /**
   * Garantiza el atlas del mundo entero de un nivel global: lo descarga todo, lo empaca y
   * lo sube. Devuelve `null` si el nivel no quedó listo (fuera de la escalera, aún en
   * curso o falló algún tile).
   */
  private async asegurarNivel(zoom: number): Promise<Texture | null> {
    const listo = this.atlases.get(zoom);
    if (listo) return listo;
    if (this.enCurso.has(zoom) || this.suelto) return null;
    if (zoom < 0 || !estaEnEscalera(zoom) || esCap(zoom)) return null;
    const perdido = this.perdidos.get(zoom);
    if (perdido !== undefined && Date.now() - perdido < ESPERA_REINTENTO_MS)
      return null;
    this.enCurso.add(zoom);
    try {
      const lado = ladoDeZoom(zoom);
      const tiles = new Map<string, ImageBitmap>();
      const claves: string[] = [];
      for (let y = 0; y < lado; y++) {
        for (let x = 0; x < lado; x++) claves.push(claveTile(zoom, x, y));
      }
      await this.llenarTiles(zoom, claves, tiles);
      const atlas = this.crearTextura(tiles, lado, lado);
      this.atlases.set(zoom, atlas);
      if (zoom >= NIVEL_SIN_CACHE) this.liberarTiles(tiles);
      return atlas;
    } catch (error) {
      // Todo o nada: un tile caído tumba el nivel entero (sin agujeros en el
      // atlas) y el globo aguanta con el nivel anterior o el color base. Se anota
      // cuándo se perdió para no relanzarlo en el frame siguiente.
      this.perdidos.set(zoom, Date.now());
      console.warn(`GAIA: nivel satelital ${zoom} no disponible`, error);
      return null;
    } finally {
      this.enCurso.delete(zoom);
    }
  }

  /**
   * Garantiza el atlas de vista del nivel cap (z6): descarga los tiles del rectángulo que
   * la cámara tiene debajo, los empaca en un atlas `cols×rows` y lo sube. Solo se
   * recompone cuando la cámara sale del rectángulo anterior, y el atlas viejo sigue en
   * pantalla hasta que el nuevo está completo (mientras se recompone, o si un tile cae,
   * el shader pinta fuera del rectángulo con el atlas global).
   *
   * ponytail: sin antirrebote de recompición —al barrer el zoom la cámara cambia de
   * rectángulo unas pocas veces y cada una encola su descarga completa (96–160 tiles,
   * en serie y reutilizando lo que ya está en `this.tiles`). Es techo conocido: si
   * aparecieralag al barrer el zoom, añadir un temporizador de reposo (~200 ms) que
   * solo recomponga cuando el rectángulo lleva ese tiempo estable.
   */
  private async asegurarCap(rect: RectCap): Promise<Texture | null> {
    const clave = claveCap(rect);
    if (this.cap && claveCap(this.cap.rect) === clave) return this.cap.textura;
    if (this.capEnCurso === clave || this.suelto) return null;
    if (
      this.capPerdido?.clave === clave &&
      Date.now() - this.capPerdido.momento < ESPERA_REINTENTO_MS
    )
      return null;
    this.capEnCurso = clave;
    try {
      const tiles = new Map<string, ImageBitmap>();
      const claves = ordenarPorCercania(
        rect.z,
        rect.x0,
        rect.y0,
        rect.cols,
        rect.rows,
      );
      await this.llenarTiles(rect.z, claves, tiles);
      const textura = this.crearTextura(
        tiles,
        rect.cols,
        rect.rows,
        rect.x0,
        rect.y0,
        this.pxTile,
      );
      const anterior = this.cap;
      this.cap = { rect, textura };
      if (anterior) anterior.textura.dispose();
      this.capPerdido = null;
      this.liberarTiles(tiles);
      return textura;
    } catch (error) {
      this.capPerdido = { clave, momento: Date.now() };
      console.warn(`GAIA: atlas de vista ${clave} no disponible`, error);
      return null;
    } finally {
      if (this.capEnCurso === clave) this.capEnCurso = null;
    }
  }

  /**
   * Rellena `tiles` con lo que haya en caché y descarga lo que falte, por lotes de
   * `TILES_POR_LOTE`. Reutilizable por el nivel global y el de vista.
   */
  private async llenarTiles(
    z: number,
    claves: string[],
    tiles: Map<string, ImageBitmap>,
  ): Promise<void> {
    const faltantes: string[] = [];
    for (const clave of claves) {
      const enCache = this.tiles.get(clave);
      if (enCache) tiles.set(clave, enCache);
      else faltantes.push(clave);
    }
    for (let i = 0; i < faltantes.length; i += TILES_POR_LOTE) {
      const lote = await Promise.all(
        faltantes
          .slice(i, i + TILES_POR_LOTE)
          .map(
            async (clave) => [clave, await this.descargar(clave, z)] as const,
          ),
      );
      if (this.suelto) return;
      for (const [clave, imagen] of lote) {
        if (this.suelto) imagen.close();
        else {
          this.tiles.set(clave, imagen); // caché: no se vuelve a pedir
          tiles.set(clave, imagen); // y el mapa que se compone ahora
        }
      }
    }
  }

  /** Sube el atlas compuesto con el filtro que evita costuras entre tiles. */
  private crearTextura(
    tiles: Map<string, ImageBitmap>,
    cols: number,
    rows: number,
    x0 = 0,
    y0 = 0,
    pxTile = PX_TILE,
  ): Texture {
    const atlas = new CanvasTexture(
      this.deps.componerAtlas(tiles, cols, rows, x0, y0, pxTile),
    );
    atlas.flipY = false; // fila 0 del esquema XYZ = norte = fila 0 del canvas
    atlas.minFilter = LinearFilter;
    atlas.magFilter = LinearFilter;
    atlas.generateMipmaps = false;
    atlas.needsUpdate = true;
    return atlas;
  }

  /** Los `ImageBitmap` ya están dentro del atlas: se sueltan para no gastar memoria. */
  private liberarTiles(tiles: Map<string, ImageBitmap>): void {
    for (const [clave, imagen] of tiles) {
      this.tiles.delete(clave);
      imagen.close();
    }
  }

  /** Un tile, con un reintento: un 429/5xx del CDN no debe tumbar un nivel de 256. */
  private async descargar(clave: string, zoom: number): Promise<ImageBitmap> {
    const [, y, x] = clave.split("/").map(Number);
    const url = this.deps.url(zoom, y, x);
    for (let intento = 1; ; intento++) {
      try {
        return await this.deps.cargarImagen(url);
      } catch (error) {
        if (intento >= INTENTOS_POR_TILE) throw error;
        await esperar(ESPERA_ENTRE_INTENTOS_MS);
      }
    }
  }

  /**
   * El atlas más detallado que exista hasta `nivel`, bajando por la escalera. Cubre el
   * hueco de la carga perezosa: al entrar en la banda de z3, hasta que sus 64 tiles
   * lleguen, el globo sigue pintado con z2 en vez de quedarse a color base. `null` solo
   * si no hay ningún atlas (recién arrancado, o todos los tiles caídos).
   */
  private atlasDe(nivel: number): Texture | null {
    for (let z = nivel; z >= 0; z--) {
      const atlas = this.atlases.get(z);
      if (atlas) return atlas;
    }
    return null;
  }

  /** Rectángulo de vista del nivel cap para la cámara en `distancia` radios. */
  private rectDeVista(distancia: number, camara: VistaCamara): RectCap | null {
    const centro = centroVista(
      camara.position.x,
      camara.position.y,
      camara.position.z,
    );
    const medioFov = (camara.fov ?? 45) / 2;
    const aspecto = camara.aspect ?? 1;
    // El nivel no es fijo: es el más detallado que cabe en el atlas para lo que la
    // pantalla cubre ahora (`zoomDeCap`). Al acercarse la cámara sube de z, y por eso el
    // contacto no se ve borroso sin gastar un atlas global. Si ni el nivel más grueso
    // cabe en el atlas, no hay cap y se sigue con los atlas globales.
    const z = zoomDeCap(centro, distancia, medioFov, aspecto, this.pxTile);
    return z === null
      ? null
      : rectDeCap(z, centro, distancia, medioFov, aspecto);
  }

  /**
   * Deja los uniforms del cruce de niveles según la distancia de cámara.
   * Se llama por frame desde el `onBeforeRender` del geoide.
   *
   * La cámara es opcional: sin ella el atlas de vista no se puede colocar (hace falta
   * saber qué punto de la superficie tiene la cámara debajo) y se sigue pintando con
   * los atlas globales, que es lo que cubren las pruebas de la unidad.
   */
  sincronizar(distancia: number, camara?: VistaCamara): void {
    const { zoomA, zoomB, peso } = nivelesConFade(distancia);
    // Los niveles de contacto no se precargan: se piden aquí, la primera vez que la
    // cámara entra en su banda. `enCurso` evita relanzar la descarga cada frame.
    if (!esCap(zoomA) && !this.atlases.has(zoomA))
      void this.asegurarNivel(zoomA);
    if (zoomB !== zoomA && !esCap(zoomB) && !this.atlases.has(zoomB))
      void this.asegurarNivel(zoomB);
    // El atlas de vista se pide al entrar en la banda de z6 y se recompone solo si la
    // cámara se ha salido del rectángulo que cubre (el nivel lo elige `zoomDeCap`).
    if (esCap(zoomA) && camara) {
      const rect = this.rectDeVista(distancia, camara);
      if (rect) void this.asegurarCap(rect);
    }
    const cap = this.cap?.textura ?? null;
    const a = (esCap(zoomA) ? cap : null) ?? this.atlasDe(zoomA);
    // El slot B es un atlas global: es lo que se ve fuera del rectángulo del cap y lo
    // que se mezcla en la banda de cruce. Si no hay ninguno, se repite A antes que
    // dejar un hueco negro.
    const b = this.atlasDe(zoomB) ?? a;
    const u = this.material.uniforms;
    u.u_atlasA.value = a;
    u.u_atlasB.value = b;
    // Sin mezcla si falta el nivel lejano del cruce o si el cercano no llegó y se
    // está pintando con el mismo atlas en los dos huecos (mezclarlo consigo mismo
    // no cambia nada).
    u.u_cruce.value = a && b && a !== b ? peso : 0;
    u.u_tieneAtlas.value = a ? 1 : 0;
    const rect =
      esCap(zoomA) && a === cap && this.cap
        ? uvDeCap(this.cap.rect)
        : MUNDO_ENTERO;
    u.u_rectA.value.set(rect.u0, rect.v0, rect.ancho, rect.alto);
  }

  dispose(): void {
    this.suelto = true;
    for (const atlas of this.atlases.values()) atlas.dispose();
    this.atlases.clear();
    this.cap?.textura.dispose();
    this.cap = null;
    for (const imagen of this.tiles.values()) imagen.close();
    this.tiles.clear();
    this.perdidos.clear();
  }
}

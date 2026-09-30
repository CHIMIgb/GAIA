/**
 * Descarga y caché de tiles satelitales Esri (ROADMAP 1.4.1).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 lo nombra como "Descarga y caché de tiles
 * satelitales (Esri) y DEM (Terrarium)" y `GAIA_GLOBE_TEXTURES.md` §1.1 da la URL
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
 *   (z3 al pasar de 1.9 radios, z4 al pasar de 1.65). El primero que entre casi agota el
 *   detalle y el segundo es el que arregla el defecto reportado —con solo z2 el atlas se
 *   magnifica ~5× en el zoom máximo y el planeta se ve borroso—, así que el techo de
 *   1.4.1 sube a z4: son 4096², ~67 MB de textura que solo se pagan al acercarse del
 *   todo. Si el nivel no llega, `sincronizar` deja al globo en el anterior.
 * - El cruce entre niveles va con un fade (uniform `u_cruce`), que es el "sin saltos de
 *   textura evidentes" del criterio.
 *
 * El `cargarImagen`/`componerAtlas`/`url` van inyectados para poder probar el
 * cableado sin red ni canvas 2D; los defaults son la implementación de producción.
 */
import { CanvasTexture, LinearFilter, ShaderMaterial, Texture } from "three";

import {
  ZOOM_MAXIMO,
  ladoDeZoom,
  nivelesConFade,
  urlTileEsri,
} from "../../utils/tilesSatelite";

/** Clave de caché de un tile; `z/y/x`, el mismo orden que la plantilla de la URL. */
const claveTile = (z: number, x: number, y: number) => `${z}/${y}/${x}`;

/** Píxeles por lado de un tile Esri (GAIA_GLOBE_TEXTURES §1.1: 256×256). */
const PX_TILE = 256;

/**
 * Tiles en vuelo a la vez. De uno en uno, los 256 de z4 serían 256 viajes de ida y
 * vuelta; el proveedor aguenta bien este paralelismo y el tiempo cae a una fracción.
 */
const TILES_POR_LOTE = 12;

/**
 * Intentos por tile antes de dar el nivel por perdido. El "todo o nada" de 1.4.1 es
 * correcto con 16 tiles, pero con 256 de z4 es casi seguro que uno se encuentre con
 * una respuesta del CDN sin cabeceras CORS (lo seencontró la verificación en
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

const cargarImagenProd = async (url: string): Promise<ImageBitmap> => {
  const respuesta = await fetch(url);
  if (!respuesta.ok) throw new Error(`tile Esri HTTP ${respuesta.status}`);
  return createImageBitmap(await respuesta.blob());
};

const componerAtlasProd = (
  tiles: Map<string, ImageBitmap>,
  lado: number,
): HTMLCanvasElement => {
  const px = lado * PX_TILE;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin contexto 2D para el atlas");
  // La fila 0 del esquema XYZ es el norte y el canvas dibuja fila 0 arriba:
  // el atlas queda en la misma orientación que muestrea el shader.
  for (const [clave, imagen] of tiles) {
    const [, y, x] = clave.split("/").map(Number);
    ctx.drawImage(imagen, x * PX_TILE, y * PX_TILE);
  }
  return canvas;
};

export interface TileManagerDeps {
  cargarImagen: (url: string) => Promise<ImageBitmap>;
  componerAtlas: (
    tiles: Map<string, ImageBitmap>,
    lado: number,
  ) => HTMLCanvasElement;
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
  private suelto = false;

  constructor(material: ShaderMaterial, deps?: Partial<TileManagerDeps>) {
    this.material = material;
    this.deps = {
      cargarImagen: cargarImagenProd,
      componerAtlas: componerAtlasProd,
      url: urlTileEsri,
      ...deps,
    };
  }

  /** Prepara los tres niveles base en segundo plano (1 + 4 + 16 tiles). Idempotente. */
  async precargar(): Promise<void> {
    for (const zoom of [0, 1, 2]) {
      await this.asegurarNivel(zoom);
    }
  }

  /**
   * Garantiza el atlas del nivel: lo descarga todo, lo empaca y lo sube.
   * Devuelve `null` si el nivel no quedó listo (fuera de la escalera, aún en curso o
   * falló algún tile).
   */
  private async asegurarNivel(zoom: number): Promise<Texture | null> {
    const listo = this.atlases.get(zoom);
    if (listo) return listo;
    if (this.enCurso.has(zoom) || this.suelto) return null;
    if (zoom > ZOOM_MAXIMO || zoom < 0) return null;
    const perdido = this.perdidos.get(zoom);
    if (perdido !== undefined && Date.now() - perdido < ESPERA_REINTENTO_MS)
      return null;
    this.enCurso.add(zoom);
    try {
      const lado = ladoDeZoom(zoom);
      const tiles = new Map<string, ImageBitmap>();
      const faltantes: string[] = [];
      for (let y = 0; y < lado; y++) {
        for (let x = 0; x < lado; x++) {
          const clave = claveTile(zoom, x, y);
          const enCache = this.tiles.get(clave);
          if (enCache) tiles.set(clave, enCache);
          else faltantes.push(clave);
        }
      }
      for (let i = 0; i < faltantes.length; i += TILES_POR_LOTE) {
        const lote = await Promise.all(
          faltantes
            .slice(i, i + TILES_POR_LOTE)
            .map(
              async (clave) =>
                [clave, await this.descargar(clave, zoom)] as const,
            ),
        );
        if (this.suelto) return null;
        for (const [clave, imagen] of lote) {
          if (this.suelto) imagen.close();
          else {
            this.tiles.set(clave, imagen); // caché: no se vuelve a pedir
            tiles.set(clave, imagen); // y el mapa que se compone ahora
          }
        }
      }
      const atlas = new CanvasTexture(this.deps.componerAtlas(tiles, lado));
      atlas.flipY = false; // fila 0 del esquema XYZ = norte = fila 0 del canvas
      atlas.minFilter = LinearFilter;
      atlas.magFilter = LinearFilter;
      atlas.generateMipmaps = false;
      atlas.needsUpdate = true;
      this.atlases.set(zoom, atlas);
      if (zoom >= NIVEL_SIN_CACHE) {
        for (const [clave, imagen] of tiles) {
          this.tiles.delete(clave);
          imagen.close();
        }
      }
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
   * El atlas más detallado que exista, bajando desde `nivel`. Cubre el hueco de la
   * carga perezosa: al entrar en la banda de z3, hasta que sus 64 tiles llegan, el
   * globo sigue pintado con z2 en vez de quedarse a color base. `null` solo si no hay
   * ningún atlas (recién arrancado, o todos los tiles caídos).
   */
  private atlasDe(nivel: number): Texture | null {
    for (let z = nivel; z >= 0; z--) {
      const atlas = this.atlases.get(z);
      if (atlas) return atlas;
    }
    return null;
  }

  /**
   * Deja los uniforms del cruce de niveles según la distancia de cámara.
   * Se llama por frame desde el `onBeforeRender` del geoide.
   */
  sincronizar(distancia: number): void {
    const { zoomA, zoomB, peso } = nivelesConFade(distancia);
    // Los niveles de contacto no se precargan: se piden aquí, la primera vez que la
    // cámara entra en su banda. `enCurso` evita relanzar la descarga cada frame.
    if (!this.atlases.has(zoomA)) void this.asegurarNivel(zoomA);
    if (zoomB !== zoomA && !this.atlases.has(zoomB))
      void this.asegurarNivel(zoomB);
    const a = this.atlasDe(zoomA);
    const b = this.atlases.get(zoomB) ?? null;
    const u = this.material.uniforms;
    u.u_atlasA.value = a;
    u.u_atlasB.value = b;
    // Sin mezcla si falta el nivel lejano del cruce o si el cercano no llegó y se
    // está pintando con el mismo atlas en los dos huecos (mezclarlo consigo mismo
    // no cambia nada).
    u.u_cruce.value = a && b && a !== b ? peso : 0;
    u.u_tieneAtlas.value = a ? 1 : 0;
  }

  dispose(): void {
    this.suelto = true;
    for (const atlas of this.atlases.values()) atlas.dispose();
    this.atlases.clear();
    for (const imagen of this.tiles.values()) imagen.close();
    this.tiles.clear();
    this.perdidos.clear();
  }
}

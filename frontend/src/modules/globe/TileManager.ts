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
 * - Cada nivel (z0-vista global 1 tile, z1-continental 4, z2-regional 16) se
 *   descarga completo —"todo o nada": si falta un tile el nivel no se activa y
 *   el globo se queda con el anterior o con el color base— y se EMPACA en un
 *   atlas cuadrado continuo (256×lado). El atlas es exactamente la proyección
 *   mercator del mundo cosida de tiles contiguos, así que el fragment shader lo
 *   muestrea con la propia coordenada mercator: sin meshes por tile, sin costura
 *   entre tiles (la única posible es la del borde fecha, que es a lo que mira
 *   1.4.2), y un solo `sampler2D` por nivel.
 * - Los tres niveles se precargan en segundo plano al arrancar (21 tiles, ~250
 *   KB): al cambiar la distancia el swap entre niveles es instantáneo y se cruza
 *   con un fade (uniform `u_cruce`), que es el "sin saltos de textura evidentes"
 *   del criterio.
 *
 * El `cargarImagen`/`componerAtlas`/`url` van inyectados para poder probar el
 * cableado sin red ni canvas 2D; los defaults son la implementación de producción.
 */
import { CanvasTexture, LinearFilter, ShaderMaterial, Texture } from "three";

import {
  ladoDeZoom,
  nivelesConFade,
  urlTileEsri,
} from "../../utils/tilesSatelite";

/** Clave de caché de un tile; `z/y/x`, el mismo orden que la plantilla de la URL. */
const claveTile = (z: number, x: number, y: number) => `${z}/${y}/${x}`;

/** Píxeles por lado de un tile Esri (GAIA_GLOBE_TEXTURES §1.1: 256×256). */
const PX_TILE = 256;

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

  /** Prepara los tres niveles en segundo plano (1 + 4 + 16 tiles). Idempotente. */
  async precargar(): Promise<void> {
    for (const zoom of [0, 1, 2]) {
      await this.asegurarNivel(zoom);
    }
  }

  /**
   * Garantiza el atlas del nivel: lo descarga todo, lo empaca y lo sube.
   * Devuelve `null` si el nivel no quedó listo (aún en curso o falló algún tile).
   */
  private async asegurarNivel(zoom: number): Promise<Texture | null> {
    const listo = this.atlases.get(zoom);
    if (listo) return listo;
    if (this.enCurso.has(zoom) || this.suelto) return null;
    this.enCurso.add(zoom);
    try {
      const lado = ladoDeZoom(zoom);
      const tiles = new Map<string, ImageBitmap>();
      for (let y = 0; y < lado; y++) {
        for (let x = 0; x < lado; x++) {
          const clave = claveTile(zoom, x, y);
          let imagen = this.tiles.get(clave);
          if (!imagen) {
            imagen = await this.deps.cargarImagen(this.deps.url(zoom, y, x));
            if (this.suelto) return null;
            this.tiles.set(clave, imagen);
          }
          tiles.set(clave, imagen);
        }
      }
      const atlas = new CanvasTexture(this.deps.componerAtlas(tiles, lado));
      atlas.flipY = false; // fila 0 del esquema XYZ = norte = fila 0 del canvas
      atlas.minFilter = LinearFilter;
      atlas.magFilter = LinearFilter;
      atlas.generateMipmaps = false;
      atlas.needsUpdate = true;
      this.atlases.set(zoom, atlas);
      return atlas;
    } catch (error) {
      // Todo o nada: un tile caído tumba el nivel entero (sin agujeros en el
      // atlas) y el globo aguanta con el nivel anterior o el color base.
      console.warn(`GAIA: nivel satelital ${zoom} no disponible`, error);
      return null;
    } finally {
      this.enCurso.delete(zoom);
    }
  }

  /**
   * Deja los uniforms del cruce de niveles según la distancia de cámara.
   * Se llama por frame desde el `onBeforeRender` del geoide.
   */
  sincronizar(distancia: number): void {
    const { zoomA, zoomB, peso } = nivelesConFade(distancia);
    const a = this.atlases.get(zoomA) ?? null;
    const b = this.atlases.get(zoomB) ?? null;
    const u = this.material.uniforms;
    u.u_atlasA.value = a;
    u.u_atlasB.value = b;
    // Si el nivel lejano del cruce aún no está, no mezcla: se queda con el A.
    u.u_cruce.value = a && b ? peso : 0;
    u.u_tieneAtlas.value = a ? 1 : 0;
  }

  dispose(): void {
    this.suelto = true;
    for (const atlas of this.atlases.values()) atlas.dispose();
    this.atlases.clear();
    this.tiles.clear();
  }
}

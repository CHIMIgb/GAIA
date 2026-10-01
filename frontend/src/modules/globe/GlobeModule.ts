/**
 * Orquestador del globo (ROADMAP 1.2.1, 1.2.2).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 le asigna "crea la esfera, aplica texturas y
 * shaders".
 *
 * Desde 1.2.2 el material de la esfera es el `ShaderMaterial` de `AtmosphereMesh` —una
 * decisión de ese paso: un único material que hace lado noche, terminador y brillo de
 * borde en un draw call, en vez de una cáscara exterior aparte—, así que sustituye al
 * `MeshStandardMaterial` que 1.2.1 ponía aquí. (Por pedido del usuario antes de validar
 * 1.4.1, el lado noche y el terminador ya no se dibujan: la luz es uniforme y solo queda
 * el brillo del limbo.) `TerrainMesh` conserva la geometría y los colores base, que es
 * lo que el shader usa como `uniform`.
 *
 * Sigue siendo una sola malla: el shader pinta sobre la misma esfera, así que los draw
 * calls no cambian respecto a 1.2.1.
 *
 * Desde 1.3.1 entra el relieve: `cargarElevacion()` enchufa los heightmaps
 * globales al material y el `onBeforeRender` de la malla reparte el peso entre niveles
 * según la distancia de la cámara (`ElevationLOD`). Los assets se cargan en `source`
 * como URLs de Vite y se leen a través del `TextureLoader` de `iniciarElevacion()`.
 * Desde 1.3.3 hay un tercer nivel: `TileManager.cargarRelieve()` baja el DEM z3 en runtime
 * y `enlazarRelieveRuntime()` lo enchufa cuando llega; si no llega, el z2 hace de tercero y
 * el relieve es el de 1.3.1 (`mezclaTresNiveles`).
 * Desde 1.4.1 entra la textura satelital: `iniciarTextura()` crea el `TileManager`
 * (descarga los tres niveles Esri y los empaca en atlas) y su `sincronizar()` se cuela
 * en el mismo `onBeforeRender`, así el reparto por distancia de textura y relieve va en
 * un solo punto por frame.
 *
 * Desde 1.3.3 el mismo hook cambia el peldaño de malla (`ajustarMalla`): la esfera pasa
 * de 256×128 a 512×256 y a 1024×512 segmentos al acercarse, con la histéresis de
 * `indiceMalla`. Cambia la geometría, no la malla ni el material.
 */
import { LinearFilter, Texture, TextureLoader } from "three";

import elevacionAlta from "../../assets/textures/elevacion_alta.png";
import elevacionBaja from "../../assets/textures/elevacion_baja.png";

import { AtmosphereMesh } from "./AtmosphereMesh";
import {
  ESCALA_ELEVACION,
  MALLAS,
  NIVEL_MAR,
  indiceMalla,
  mezclaTresNiveles,
  pesoNivel,
} from "./ElevationLOD";
import { TerrainMesh } from "./TerrainMesh";
import { TileManager } from "./TileManager";

import type { Scene } from "three";

export class GlobeModule {
  /** La malla del geoide, expuesta para que los pasos siguientes la puedan usar. */
  readonly malla: TerrainMesh["malla"];
  /** La atmósfera, para que 1.3 (displacement) y 1.4 (textura) alcancen el material. */
  readonly atmosfera: AtmosphereMesh;

  private readonly terreno: TerrainMesh;
  private nivelBajo: Texture | null = null;
  private nivelMedio: Texture | null = null;
  /**
   * Tercer nivel (1.3.3): el DEM z3 que baja `TileManager` en runtime. No es nuestro —lo
   * suelta el `TileManager`—, y sin él apunta al asset z2 para que el shader muestree lo
   * mismo en el hueco del tercero. `tresNiveles` dice cuál de las dos cosas es.
   */
  private nivelAlto: Texture | null = null;
  private tresNiveles = false;
  private tiles: TileManager | null = null;
  /** Peldaño de malla puesto (índice en `MALLAS`), para no reconstruirla cada frame. */
  private mallaActual = 0;
  private suelto = false;

  constructor(escena: Scene) {
    this.terreno = new TerrainMesh();
    this.atmosfera = new AtmosphereMesh();
    this.malla = this.terreno.malla;
    this.malla.material = this.atmosfera.material;
    escena.add(this.malla);
  }

  /** Carga los heightmaps empaquetados. Se llama una vez, tras `Engine.start()`. */
  async iniciarElevacion(): Promise<void> {
    const cargar = new TextureLoader();
    const [baja, alta] = await Promise.all([
      cargar.loadAsync(elevacionBaja),
      cargar.loadAsync(elevacionAlta),
    ]);
    if (this.suelto) {
      baja.dispose();
      alta.dispose();
      return;
    }
    this.cargarElevacion(baja, alta);
    // El z3 del runtime se pide aparte: si el `TileManager` ya existe (según en qué
    // orden se llamen este y `iniciarTextura`), arranca ya; si no, lo hará el otro.
    void this.enlazarRelieveRuntime();
  }

  /**
   * Enchufa los heightmaps al material y reparte el LOD por frame según la cámara.
   *
   * Sincronizado a propósito para que los tests puedan pasar texturas falsas sin red.
   * Sin filtros mipmap: el shader muestrea en el vertex shader, donde no hay derivadas,
   * y un `LinearMipmapLinearFilter` dejaría el LOD indefinido.
   *
   * `media` es el asset z2 y `alta` el DEM z3 del runtime (1.3.3). Sin `alta` —que es lo
   * que pasa mientras se descarga, o si la descarga cae— el z2 ocupa también el hueco del
   * tercero y `mezclaTresNiveles` devuelve la rampa de 1.3.1: mismo relieve de siempre.
   */
  cargarElevacion(baja: Texture, media: Texture, alta?: Texture): void {
    this.limpiarTexturas();
    this.nivelBajo = baja;
    this.nivelMedio = media;
    this.nivelAlto = alta ?? media;
    this.tresNiveles = alta !== undefined;
    for (const tex of alta ? [baja, media, alta] : [baja, media]) {
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    }
    const u = this.atmosfera.material.uniforms;
    u.nivelBajo.value = baja;
    u.nivelMedio.value = media;
    u.nivelAlto.value = this.nivelAlto;
    u.escalaElevacion.value = ESCALA_ELEVACION;
    // 1.3.2: los océanos son planos en la superficie terrestre (el mar lo dibuja F2).
    u.nivelMar.value = NIVEL_MAR;
    // El frame siguiente lo ajusta `onBeforeRender`; aquí deja el globo liso de arranque.
    u.pesoNivelAlto.value = 0;
    u.mezclaMedio.value = 0;
    this.programarLODPorDistancia();
  }

  /**
   * Enlaza el DEM z3 del runtime cuando esté (ROADMAP 1.3.3). Idempotente y silencioso:
   * si no hay `TileManager`, no hay relieve cargado todavía o ya se enlazó, no hace nada.
   * Si la descarga cae, `cargarRelieve` devuelve `null` y el relieve se queda con el
   * asset z2, que es el respaldo del paso.
   */
  private async enlazarRelieveRuntime(): Promise<void> {
    const tiles = this.tiles;
    if (!tiles || !this.nivelMedio || this.tresNiveles) return;
    const textura = await tiles.cargarRelieve();
    if (!textura || this.suelto || this.tresNiveles) return;
    this.nivelAlto = textura;
    this.tresNiveles = true;
    this.atmosfera.material.uniforms.nivelAlto.value = textura;
  }

  /**
   * Enchufa la textura satelital (1.4.1): crea el `TileManager` con los atlas Esri y
   * arranca la descarga en segundo plano. No necesita `await` para el primer frame:
   * hasta que el nivel 0 llegue, `u_tieneAtlas = 0` y el globo es el color base. Desde
   * 1.3.3 el mismo `TileManager` es quien baja el DEM z3, así que aquí se enlaza.
   */
  iniciarTextura(): void {
    if (this.tiles) return;
    this.tiles = new TileManager(this.atmosfera.material);
    void this.tiles.precargar();
    void this.enlazarRelieveRuntime();
    this.programarLODPorDistancia();
  }

  /**
   * Reparto por distancia en el único hook por frame de la malla: los pesos de los tres
   * heightmaps (1.3.1 y 1.3.3), el peldaño de malla (1.3.3) y el cruce de niveles del
   * atlas (1.4.1) salen de la misma distancia de cámara, así que comparten
   * `onBeforeRender`.
   * La cámara se pasa entera porque el atlas de vista de z6 necesita saber qué punto de
   * la superficie tiene debajo para saber qué tiles bajar. Si aún no hay textura
   * (`iniciarTextura()` sin llamar o sin niveles listos), `sincronizar` es un no-op.
   */
  private programarLODPorDistancia(): void {
    this.malla.onBeforeRender = (_rend, _escena, camara) => {
      if (this.suelto) return;
      const distancia = camara.position.length();
      // La rampa validada de 1.3.1 se parte en dos mitades cuando hay z3; sin él,
      // `mezclaTresNiveles` devuelve exactamente la rampa de antes.
      const { medio, alto } = mezclaTresNiveles(
        pesoNivel(distancia),
        this.tresNiveles,
      );
      const u = this.atmosfera.material.uniforms;
      u.mezclaMedio.value = medio;
      u.pesoNivelAlto.value = alto;
      this.ajustarMalla(distancia);
      this.tiles?.sincronizar(distancia, camara);
    };
  }

  /**
   * Peldaño de malla según la distancia (ROADMAP 1.3.3). `indiceMalla` lleva la
   * histéresis y `fijarMalla` es idempotente, así que esto se puede llamar en cada
   * frame sin reconstruir nada mientras la cámara no cruce de banda.
   */
  private ajustarMalla(distancia: number): void {
    const indice = indiceMalla(distancia, this.mallaActual);
    if (indice === this.mallaActual) return;
    this.mallaActual = indice;
    this.terreno.fijarMalla(MALLAS[indice]);
  }

  private limpiarTexturas(): void {
    this.nivelBajo?.dispose();
    // El nivel alto nunca se suelta aquí: o es el mismo objeto que `nivelMedio` (sin z3)
    // o es la textura del `TileManager`, que la suelta él en su `dispose()`.
    if (this.nivelMedio && this.nivelMedio !== this.nivelBajo) {
      this.nivelMedio.dispose();
    }
    this.nivelBajo = null;
    this.nivelMedio = null;
    this.nivelAlto = null;
    this.tresNiveles = false;
  }

  dispose(): void {
    this.suelto = true;
    this.limpiarTexturas();
    this.tiles?.dispose();
    this.tiles = null;
    // El `onBeforeRender` queda, pero con `suelto` no toca los uniforms; ponerlo a
    // `null` no compila porque Three lo declara como método, y reemplazarlo por un
    // noop solo esconde la misma cosa.
    this.malla.removeFromParent();
    // `AtmosphereMesh.dispose()` suelta el material que está asignado; el de `TerrainMesh`
    // ya no lo está y no hay que volver a liberarlo. La geometría es la misma malla, y la
    // suelta `TerrainMesh`.
    this.atmosfera.dispose();
    this.terreno.dispose();
  }
}

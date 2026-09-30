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
 * Desde 1.3.1 entra el relieve: `cargarElevacion()` enchufa los dos heightmaps
 * globales al material y el `onBeforeRender` de la malla reparte el peso entre niveles
 * según la distancia de la cámara (`ElevationLOD`). Los assets se cargan en `source`
 * como URLs de Vite y se leen a través del `TextureLoader` de `iniciarElevacion()`.
 * Desde 1.4.1 entra la textura satelital: `iniciarTextura()` crea el `TileManager`
 * (descarga los tres niveles Esri y los empaca en atlas) y su `sincronizar()` se cuela
 * en el mismo `onBeforeRender`, así el reparto por distancia de textura y relieve va en
 * un solo punto por frame.
 */
import { LinearFilter, Texture, TextureLoader } from "three";

import elevacionAlta from "../../assets/textures/elevacion_alta.png";
import elevacionBaja from "../../assets/textures/elevacion_baja.png";

import { AtmosphereMesh } from "./AtmosphereMesh";
import { ESCALA_ELEVACION, NIVEL_MAR, pesoNivel } from "./ElevationLOD";
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
  private nivelAlto: Texture | null = null;
  private tiles: TileManager | null = null;
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
  }

  /**
   * Enchufa los heightmaps al material y reparte el LOD por frame según la cámara.
   *
   * Sincronizado a propósito para que los tests puedan pasar texturas falsas sin red.
   * Sin filtros mipmap: el shader muestrea en el vertex shader, donde no hay derivadas,
   * y un `LinearMipmapLinearFilter` dejaría el LOD indefinido.
   */
  cargarElevacion(baja: Texture, alta: Texture): void {
    this.limpiarTexturas();
    this.nivelBajo = baja;
    this.nivelAlto = alta;
    for (const tex of [baja, alta]) {
      tex.minFilter = LinearFilter;
      tex.magFilter = LinearFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
    }
    const u = this.atmosfera.material.uniforms;
    u.nivelBajo.value = baja;
    u.nivelAlto.value = alta;
    u.escalaElevacion.value = ESCALA_ELEVACION;
    // 1.3.2: los océanos son planos en la superficie terrestre (el mar lo dibuja F2).
    u.nivelMar.value = NIVEL_MAR;
    // El frame siguiente lo ajusta `onBeforeRender`; aquí deja el globo liso de arranque.
    u.pesoNivelAlto.value = 0;
    this.programarLODPorDistancia();
  }

  /**
   * Enchufa la textura satelital (1.4.1): crea el `TileManager` con los atlas Esri y
   * arranca la descarga en segundo plano. No necesita `await` para el primer frame:
   * hasta que el nivel 0 llegue, `u_tieneAtlas = 0` y el globo es el color base.
   */
  iniciarTextura(): void {
    if (this.tiles) return;
    this.tiles = new TileManager(this.atmosfera.material);
    void this.tiles.precargar();
    this.programarLODPorDistancia();
  }

  /**
   * Reparto por distancia en el único hook por frame de la malla: el peso entre los dos
   * heightmaps (1.3.1) y el cruce de niveles del atlas (1.4.1) salen de la misma
   * distancia de cámara, así que comparten `onBeforeRender`. La cámara se pasa entera
   * porque el atlas de vista de z6 necesita saber qué punto de la superficie tiene
   * debajo para saber qué tiles bajar. Si aún no hay textura
   * (`iniciarTextura()` sin llamar o sin niveles listos), `sincronizar` es un no-op.
   */
  private programarLODPorDistancia(): void {
    this.malla.onBeforeRender = (_rend, _escena, camara) => {
      if (this.suelto) return;
      const distancia = camara.position.length();
      this.atmosfera.material.uniforms.pesoNivelAlto.value =
        pesoNivel(distancia);
      this.tiles?.sincronizar(distancia, camara);
    };
  }

  private limpiarTexturas(): void {
    this.nivelBajo?.dispose();
    this.nivelAlto?.dispose();
    this.nivelBajo = null;
    this.nivelAlto = null;
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

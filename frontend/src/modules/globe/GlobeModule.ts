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
 * Desde 1.4.1 entra la textura satelital: `iniciarTextura()` crea el `TileManager`
 * (descarga los tres niveles Esri y los empaca en atlas) y su `sincronizar()` va en el
 * `onBeforeRender` de la malla, el único hook por frame.
 */
import { AtmosphereMesh } from "./AtmosphereMesh";
import { TerrainMesh } from "./TerrainMesh";
import { TileManager } from "./TileManager";

import type { Scene } from "three";

export class GlobeModule {
  /** La malla del geoide, expuesta para que los pasos siguientes la puedan usar. */
  readonly malla: TerrainMesh["malla"];
  /** La atmósfera, para que 1.4 (textura) alcance el material. */
  readonly atmosfera: AtmosphereMesh;

  private readonly terreno: TerrainMesh;
  private tiles: TileManager | null = null;
  private suelto = false;

  constructor(escena: Scene) {
    this.terreno = new TerrainMesh();
    this.atmosfera = new AtmosphereMesh();
    this.malla = this.terreno.malla;
    this.malla.material = this.atmosfera.material;
    escena.add(this.malla);
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
   * Reparto por distancia en el único hook por frame de la malla: el cruce de niveles del
   * atlas (1.4.1) sale de la distancia de cámara.
   * La cámara se pasa entera porque el atlas de vista de z6 necesita saber qué punto de
   * la superficie tiene debajo para saber qué tiles bajar. Si aún no hay textura
   * (`iniciarTextura()` sin llamar o sin niveles listos), `sincronizar` es un no-op.
   */
  private programarLODPorDistancia(): void {
    this.malla.onBeforeRender = (_rend, _escena, camara) => {
      if (this.suelto) return;
      this.tiles?.sincronizar(camara.position.length(), camara);
    };
  }

  dispose(): void {
    this.suelto = true;
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

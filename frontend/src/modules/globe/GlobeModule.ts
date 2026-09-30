/**
 * Orquestador del globo (ROADMAP 1.2.1, 1.2.2).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 le asigna "crea la esfera, aplica texturas y
 * shaders".
 *
 * Desde 1.2.2 el material de la esfera es el `ShaderMaterial` de `AtmosphereMesh` —una
 * decisión de ese paso: un único material que hace lado noche, terminador y brillo de
 * borde en un draw call, en vez de una cáscara exterior aparte—, así que sustituye al
 * `MeshStandardMaterial` que 1.2.1 ponía aquí. `TerrainMesh` conserva la geometría y los
 * colores base, que es lo que el shader usa como `uniform`.
 *
 * Sigue siendo una sola malla: el shader pinta sobre la misma esfera, así que los draw
 * calls no cambian respecto a 1.2.1.
 */
import { AtmosphereMesh } from "./AtmosphereMesh";
import { TerrainMesh } from "./TerrainMesh";

import type { Scene } from "three";

export class GlobeModule {
  /** La malla del geoide, expuesta para que los pasos siguientes la puedan usar. */
  readonly malla: TerrainMesh["malla"];
  /** La atmósfera, para que 1.3 (displacement) y 1.4 (textura) alcancen el material. */
  readonly atmosfera: AtmosphereMesh;

  private readonly terreno: TerrainMesh;

  constructor(escena: Scene) {
    this.terreno = new TerrainMesh();
    this.atmosfera = new AtmosphereMesh();
    this.malla = this.terreno.malla;
    this.malla.material = this.atmosfera.material;
    escena.add(this.malla);
  }

  dispose(): void {
    this.malla.removeFromParent();
    // `AtmosphereMesh.dispose()` suelta el material que está asignado; el de `TerrainMesh`
    // ya no lo está y no hay que volver a liberarlo. La geometría es la misma malla, y la
    // suelta `TerrainMesh`.
    this.atmosfera.dispose();
    this.terreno.dispose();
  }
}

/**
 * Orquestador del globo (ROADMAP 1.2.1).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 le asigna "crea la esfera, aplica texturas y
 * shaders". Hoy solo hay una malla; en 1.2.2 entra `AtmosphereMesh`, en 1.3 el
 * displacement y en 1.4 el `TileManager`, y los cuatro cuelgan de aquí para que el motor
 * no tenga que saber cuántos hay.
 */
import { TerrainMesh } from "./TerrainMesh";

import type { Scene } from "three";

export class GlobeModule {
  /** La malla del geoide, expuesta para que los pasos siguientes la puedan usar. */
  readonly malla: TerrainMesh["malla"];

  private readonly terreno: TerrainMesh;

  constructor(escena: Scene) {
    this.terreno = new TerrainMesh();
    this.malla = this.terreno.malla;
    escena.add(this.malla);
  }

  dispose(): void {
    this.malla.removeFromParent();
    this.terreno.dispose();
  }
}

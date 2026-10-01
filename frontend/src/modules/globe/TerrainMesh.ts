/**
 * Malla del geoide (ROADMAP 1.2.1, escalera desde 1.3.3).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 le asigna a este archivo la `SphereGeometry`; el
 * displacement por altura que allí se menciona es de 1.3.1, así que de momento es una
 * esfera lisa con material estándar.
 *
 * Segmentación: desde 1.3.3 no es una constante, es la escalera `MALLAS` de
 * `ElevationLOD` (256×128 → 512×256 → 1024×512), elegida por distancia de cámara con
 * `indiceMalla`. La malla fija de 1.2.1 era 128×64: `docs/GAIA_WORKFLOWS.md` §Paso 3
 * pide "segmentación alta" y el criterio de 1.2.1 que no se vean bandas, y con los
 * 32×16 por defecto de Three el borde se ve facetado a media pantalla. 128 anillos ya
 * daban 0,29 px de silueta, pero 313 km entre vértices no dibujan ninguna cordillera,
 * que es lo que pedía 1.3.3. La escalera se apoya en el mismo material único, así que
 * sigue siendo 1 draw call en cualquier peldaño.
 */
import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";

import { MALLAS } from "./ElevationLOD";

import type { MallaNivel } from "./ElevationLOD";

/** Radio del geoide. Es el contrato con la atmósfera de 1.2.2 y el displacement de 1.3. */
const RADIO = 1;

/**
 * Color de la tierra sin textura.
 *
 * 1.2.1 no descarga nada: la textura satelital es del paso 1.4.1, con su `TileManager` y
 * su LOD. El criterio de este paso admite "env or static color", y un color plano deja
 * la silueta y la iluminación como único sujeto de la revisión visual.
 *
 * Deliberadamente apagado y desaturado: es el fondo sobre el que van las capas de datos,
 * y `GAIA_VISUAL_DESIGN` §1 pone la pantalla sobria. El azul océano `#50B5F2` de §5.2 es
 * el tono del módulo de inundación, no el del planeta.
 */
const COLOR_TIERRA = 0x1b3a52;

export class TerrainMesh {
  readonly malla: Mesh;

  /** Peldaño puesto, para que `fijarMalla()` sea idempotente. */
  private actual: MallaNivel = MALLAS[0];

  constructor() {
    this.malla = new Mesh(
      // Sin `flatShading` y sin `computeVertexNormals()`: `SphereGeometry` ya trae la
      // normal analítica de cada vértice, que es la correcta. Recalcularla por cara es lo
      // que produciría las bandas del criterio.
      this.geometria(MALLAS[0]),
      new MeshStandardMaterial({
        color: COLOR_TIERRA,
        // Mate: la capa de brillo va en el material de la atmósfera de 1.2.2, no aquí.
        roughness: 0.9,
        metalness: 0,
      }),
    );
    this.malla.name = "geoide";
  }

  /**
   * Cambia al peldaño `malla` (ROADMAP 1.3.3). Idempotente a propósito: `GlobeModule` lo
   * llama en cada frame con lo que decide `indiceMalla`, y reconstruir la geometría solo
   * por llamar sería subir 36 MB a la GPU cada frame.
   *
   * Al cambiar, la geometría vieja se suelta (`dispose()`): el peldaño fino son ~36 MB
   * entre posiciones, normales, uvs e índices, y no hay razón para tener dos a la vez. El
   * `Mesh` y el material no cambian, así que el draw call sigue siendo el mismo.
   */
  fijarMalla(malla: MallaNivel): void {
    if (malla.ancho === this.actual.ancho && malla.alto === this.actual.alto) {
      return;
    }
    const vieja = this.malla.geometry;
    this.actual = malla;
    this.malla.geometry = this.geometria(malla);
    vieja.dispose();
  }

  dispose(): void {
    this.malla.geometry.dispose();
    (this.malla.material as MeshStandardMaterial).dispose();
  }

  private geometria(malla: MallaNivel): SphereGeometry {
    return new SphereGeometry(RADIO, malla.ancho, malla.alto);
  }
}

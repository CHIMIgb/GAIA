/**
 * Malla del geoide (ROADMAP 1.2.1).
 *
 * `docs/GAIA_PROJECT_STRUCTURE.md` §1 le asigna a este archivo la `SphereGeometry`; el
 * displacement por altura que allí se menciona es de 1.3.1, así que de momento es una
 * esfera lisa con material estándar.
 *
 * Segmentación: 128x64. `docs/GAIA_WORKFLOWS.md` §Paso 3 pide "segmentación alta" y el
 * criterio de 1.2.1 que no se vean bandas. Con los 32x16 por defecto de Three el borde
 * de la esfera se ve facetado a media pantalla, que es exactamente la banda que el
 * criterio prohíbe. 128 anillos dan 16384 triángulos en un solo draw call; si al acercar
 * la cámara (1.5.2) el limbo vuelve a facetear, el número que sube es este, no el
 * material.
 */
import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";

/** Radio del geoide. Es el contrato con la atmósfera de 1.2.2 y el displacement de 1.3. */
const RADIO = 1;
const SEGMENTOS_ANCHO = 128;
const SEGMENTOS_ALTO = 64;

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

  constructor() {
    this.malla = new Mesh(
      // Sin `flatShading` y sin `computeVertexNormals()`: `SphereGeometry` ya trae la
      // normal analítica de cada vértice, que es la correcta. Recalcularla por cara es lo
      // que produciría las bandas del criterio.
      new SphereGeometry(RADIO, SEGMENTOS_ANCHO, SEGMENTOS_ALTO),
      new MeshStandardMaterial({
        color: COLOR_TIERRA,
        // Mate: la capa de brillo va en el material de la atmósfera de 1.2.2, no aquí.
        roughness: 0.9,
        metalness: 0,
      }),
    );
    this.malla.name = "geoide";
  }

  dispose(): void {
    this.malla.geometry.dispose();
    (this.malla.material as MeshStandardMaterial).dispose();
  }
}

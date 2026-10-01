/**
 * Dataset estático de 100 puntos sobre el globo (ROADMAP 1.6.1).
 *
 * El paso no es "dibujar 100 puntos": es comprobar que el mapa lat/lon → 3D de
 * `geodesicToCartesian` los deja **en su sitio** sobre la esfera, con el atlas de Esri
 * puesto. Fijarse en 100 puntos que no significan nada es como se ve una desalineación de
 * 90° o un eje invertido: no hace falta reconocer un país, basta ver que la rejilla se
 * comba en el sitio donde la superficie engaña.
 *
 * Va en `modules/globe/` porque es contenido de escena, no HUD (`components/`). Solo se
 * monta en desarrollo: `App.tsx` lo importa dinámicamente tras `import.meta.env.DEV`, así
 * que en producción la rama es código muerto y Vite la elimina.
 *
 * Es el andamiaje del camino de F2 (WORKFLOWS §3 pasa el `InstancedMesh` en un solo draw
 * call), pero no se parece a la capa de incendios: es rejilla y color plano, porque aquí
 * lo que se prueba es dónde caen los puntos, no cómo se ven.
 */
import {
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
} from "three";

import { geodesicToCartesian, RADIO_TIERRA } from "../../utils/coordinates";

/** Lado de la rejilla: 10 × 10 = los 100 puntos que pide el paso. */
const LADO = 10;

/**
 * Radio de cada punto. Justo por encima de la superficie (0,5 %): con la altura que leaves
 * el shader atmosférico, van sobre el geoide y no se pierden en el z-fighting. Un `0.005` es
 * ~30 km a escala de globo: una marca de capa, no un relieve.
 */
const ALTURA_PUNTO = 0.005;

/**
 * Rejilla uniforme: los puntos van al centro de cada celda, no en los bordes. Los polos y la
 * costura del antimeridiano quedan fuera a propósito —ahí el mapeo es degenerado (todos los
 * meridianos se juntan, y ±180 es el mismo punto)— y no son donde se lee una desalineación.
 */
export const REJILLA_MOCK: { lat: number; lon: number }[] = Array.from(
  { length: LADO * LADO },
  (_, i) => ({
    lat: -90 + ((Math.floor(i / LADO) + 0.5) * 180) / LADO,
    lon: -180 + (((i % LADO) + 0.5) * 360) / LADO,
  }),
);

/**
 * Construye la malla de 100 puntos. Un solo `InstancedMesh`, un solo draw call, con la
 * cuenta de posición hecha una vez por punto en CPU —la misma que usa el Worker 1 para
 * los focos del F2— porque no hay animación que justifique un shader propio todavía.
 */
export function crearPuntosMock(): InstancedMesh {
  const radio = RADIO_TIERRA + ALTURA_PUNTO;
  const malla = new InstancedMesh(
    // 6×4 segmentos: a esta escala (0,5 % del radio) un punto son 6 triángulos, no más.
    new SphereGeometry(ALTURA_PUNTO, 6, 4),
    // Plano y brillante a propósito: un `MeshBasicMaterial` no lee luces ni sombras, así que
    // lo que se ve es exactamente "dónde está el punto".
    new MeshBasicMaterial({ color: 0xff3b30 }),
    REJILLA_MOCK.length,
  );

  const unidad = new Object3D();
  REJILLA_MOCK.forEach(({ lat, lon }, i) => {
    unidad.position.copy(geodesicToCartesian(lat, lon, radio));
    unidad.updateMatrix();
    malla.setMatrixAt(i, unidad.matrix);
  });
  malla.instanceMatrix.needsUpdate = true;

  malla.name = "puntosMock";
  return malla;
}

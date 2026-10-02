/**
 * Mapeo geodésico → cartesiano (ROADMAP 1.6.1).
 *
 * Todas las capas del globo (fuego, sismos, radiación) necesitan la misma cuenta: dónde cae
 * una lat/lon en la esfera. Aquí vive una sola vez, y el geoide se dibuja con ella —una
 * desalineación de esta función se vería en todas las capas a la vez y sería difícil de
 * atribuir, así que el test la ata a la geometría real de Three en vez de a una fórmula
 * escrita a mano.
 *
 * Ubicación según `docs/GAIA_PROJECT_STRUCTURE.md` §2 (`utils/coordinates.ts`).
 */
import { Vector3 } from "three";

/**
 * Radio del globo. Es 1 por decisión de escala —la cámara razona en alturas sobre la
 * superficie, así que la superficie es 0 y el suelo de la cámara 0.25 (ROADMAP 1.5.2)—, y
 * lo importa `CameraController` para no tener el mismo número en dos sitios.
 */
export const RADIO_TIERRA = 1;

/**
 * Punto de la esfera a partir de su latitud y longitud, en grados.
 *
 * El azimut y el polar salen de la cuenta que hace `SphereGeometry` para sus propios vértices
 * (`x = −r·cos(φ)·sin(θ)`, `y = r·cos(θ)`, `z = r·sin(φ)·sin(θ)`): es la que hace que un
 * `lon = 0` caiga en la costura del atlas, no en la mitad de un tile, y que el norte esté en
 * `+Y` como espera el shader atmosférico. `radio` mayor que el del globo deja el punto
 * flotando sobre la superficie, que es como lo pintan las capas.
 */
export function geodesicToCartesian(
  lat: number,
  lon: number,
  radio: number = RADIO_TIERRA,
): Vector3 {
  const azimut = ((lon + 180) / 360) * 2 * Math.PI;
  const polar = ((90 - lat) / 180) * Math.PI;
  const seno = Math.sin(polar);

  return new Vector3(
    -radio * Math.cos(azimut) * seno,
    radio * Math.cos(polar),
    radio * Math.sin(azimut) * seno,
  );
}

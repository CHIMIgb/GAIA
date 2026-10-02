/**
 * `geodesicToCartesian` (ROADMAP 1.6.1) — el mapeo lat/lon → 3D del que cuelgan todas las
 * capas del globo y el Worker 1 (`utils/coordinates.ts` en PROJECT_STRUCTURE §2).
 *
 * El criterio de 1.6.1 es que los puntos caigan en su lat/lon **con el globo que ya se
 * está pintando**, no en una esfera idealizada. Por eso la referencia de estos tests no es
 * una fórmula escrita a mano sino la geometría real de Three: se recorre la
 * `SphereGeometry` del globo, se lee la uv de cada vértice, se deshace esa uv en lat/lon y se
 * comprueba que el mapeo devuelve el mismo vértice. Es el enunciado del criterio —para todo
 * punto de la esfera, la uv y el 3D son el mismo punto— y no depende de una tolerancia
 * inventada.
 */
import { SphereGeometry } from "three";
import { describe, expect, it } from "vitest";

import { geodesicToCartesian, RADIO_TIERRA } from "../../src/utils/coordinates";

/** uv equirectangular de una lat/lon: `u` en el antimeridiano, `v` en el polo norte. */
const uvDe = (lat: number, lon: number): [number, number] => [
  (lon + 180) / 360,
  (lat + 90) / 180,
];

describe("geodesicToCartesian — el mapeo que usan todas las capas", () => {
  it("invierte la uv de la SphereGeometry del globo, vértice a vértice", () => {
    const geo = new SphereGeometry(RADIO_TIERRA, 64, 32);
    const posiciones = geo.attributes.position;
    const uvs = geo.attributes.uv;

    let comprobados = 0;
    for (let i = 0; i < posiciones.count; i += 7) {
      // Cada 7 vértices: 305 de los 2145 cubren igual la costura, los polos y las cuatro
      // esquinas, y el test tarda una fracción de lo que tardaría con todos.
      const lat = uvs.getY(i) * 180 - 90;
      const lon = uvs.getX(i) * 360 - 180;
      const nuestro = geodesicToCartesian(lat, lon, RADIO_TIERRA);

      // 6 decimales, no 9: la referencia —los atributos de `SphereGeometry`— es
      // `Float32Array`, así que el propio vértice que Three pinta viene redondeado a 24 bits
      // de mantisa (~1e-7 relativo). Comparar a más precisión mediría el almacenamiento,
      // no el mapeo. 5e-7 sobre el radio es ~3 km a escala de Tierra: invisible.
      expect(nuestro.x).toBeCloseTo(posiciones.getX(i), 6);
      expect(nuestro.y).toBeCloseTo(posiciones.getY(i), 6);
      expect(nuestro.z).toBeCloseTo(posiciones.getZ(i), 6);
      comprobados++;
    }

    expect(comprobados).toBeGreaterThan(300);
  });

  it("la uv que sale del punto 3D vuelve a la misma lat/lon", () => {
    // La otra mitad del criterio: la dirección en la que se pinta (la uv del atlas, en el
    // shader atmosférico) tiene que ser la del punto. Si esto se cumple para toda la esfera,
    // ninguna capa puede quedar desplazada respecto a la textura.
    const geo = new SphereGeometry(RADIO_TIERRA, 32, 16);
    const posiciones = geo.attributes.position;
    const uvs = geo.attributes.uv;

    let enPolos = 0;
    for (let i = 0; i < posiciones.count; i++) {
      const lat =
        Math.asin(posiciones.getY(i) / RADIO_TIERRA) * (180 / Math.PI);
      // En el polo la longitud no existe: los 32 meridianos se juntan ahí, y el vértice de
      // Three lleva la uv del borde de su columna. Se cuentan aparte en vez de fingir que el
      // mapeo puede devolver algo — es justo lo que hace que la rejilla de 1.6.1 se quede
      // fuera de los polos.
      if (Math.abs(lat) > 89.9) {
        enPolos++;
        continue;
      }

      // `atan2(z, −x)` devuelve el azimut de `SphereGeometry`, que va de 0 a 2π con `u = 0`
      // —el antimeridiano—; de ahí el `−180` para volver a longitud y el `+ 360` para no
      // quedar negativo en el borde.
      const azimut = Math.atan2(posiciones.getZ(i), -posiciones.getX(i));
      const lon = (((azimut * (180 / Math.PI) - 180) % 360) + 360) % 360;
      const [u, v] = uvDe(lat, lon);
      const du = Math.abs(u - uvs.getX(i));

      // 1 % de la vuelta: la rejilla de 32×16 no incluye el vértice, y en la costura el
      // error es circular (1 y 0 son el mismo borde).
      expect(Math.min(du, 1 - du)).toBeLessThan(0.01);
      expect(Math.abs(v - uvs.getY(i))).toBeLessThan(0.01);
    }
    expect(enPolos).toBeGreaterThan(0);
  });

  it("lleva la latitud al eje Y, con el norte arriba", () => {
    expect(geodesicToCartesian(90, 0, RADIO_TIERRA).y).toBeCloseTo(
      RADIO_TIERRA,
      9,
    );
    expect(geodesicToCartesian(-90, 0, RADIO_TIERRA).y).toBeCloseTo(
      -RADIO_TIERRA,
      9,
    );
    expect(geodesicToCartesian(0, 0, RADIO_TIERRA).y).toBeCloseTo(0, 9);
  });

  it("el largo se cierra: lon +180 y lon -180 son el mismo punto", () => {
    const a = geodesicToCartesian(12, 180, RADIO_TIERRA);
    const b = geodesicToCartesian(12, -180, RADIO_TIERRA);

    // A precisión de máquina, no de igualdad estricta: `sin(2π)` vale −2,4e−16 en coma
    // flotante, así que el z del cierre del largo dista de cero en el último bit. La costura
    // del atlas usa exactamente el mismo redondeo, así que las dos ramas coinciden en
    // pantalla.
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    expect(a.z).toBeCloseTo(b.z, 9);
  });

  it("respeta el radio que le pasan, para poder flotar sobre la superficie", () => {
    // Radio mayor que el del globo: así es como las capas se apoyan sin quedar incrustadas.
    expect(geodesicToCartesian(37, -3, RADIO_TIERRA).length()).toBeCloseTo(
      RADIO_TIERRA,
      9,
    );
    expect(
      geodesicToCartesian(37, -3, RADIO_TIERRA + 0.005).length(),
    ).toBeCloseTo(RADIO_TIERRA + 0.005, 9);
  });

  it("el radio del globo es uno, el mismo que usa la cámara como suelo", () => {
    // `CameraController` importa esta constante desde aquí: dos números iguales en dos
    // archivos son una desincronización esperando a ocurrir.
    expect(RADIO_TIERRA).toBe(1);
  });
});

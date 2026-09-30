/**
 * Matemática de tiles satelitales (ROADMAP 1.4.1).
 *
 * El fragment shader muestrea el atlas en coordenadas mercator; esta matemática
 * es el espejo CPU que se puede validar sin GPU (patrón `decodeTerrarium`/GLSL):
 * nivel por distancia, tile por lat/lon, URL del proveedor y cruce suave.
 */
import { describe, expect, it } from "vitest";

import {
  LAT_LIMITE,
  arcoEnPantalla,
  centroVista,
  esCap,
  estaEnEscalera,
  ladoDeZoom,
  nivelesConFade,
  rectDeCap,
  tileDeLonLat,
  urlTileEsri,
  uvDeCap,
  vMercator,
  zoomParaDistancia,
} from "../../src/utils/tilesSatelite";

/** Cámara de la app: `PerspectiveCamera(45, aspecto, ...)` en `Engine`. */
const FOV = 45;
const ASPECTO_16_9 = 16 / 9;

describe("tilesSatelite — URL y geometría (ROADMAP 1.4.1)", () => {
  it("arma la URL de Esri con el orden {z}/{y}/{x} del doc §1.1", () => {
    expect(urlTileEsri(2, 1, 3)).toBe(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/3",
    );
  });

  it("el lado del nivel es 2^zoom (1, 2, 4, 8, 16)", () => {
    expect(ladoDeZoom(0)).toBe(1);
    expect(ladoDeZoom(2)).toBe(4);
    expect(ladoDeZoom(3)).toBe(8);
    expect(ladoDeZoom(4)).toBe(16);
  });

  it("mapea lon/lat al tile XYZ correcto", () => {
    // lon -180 → columna 0; lon 0 → columna central; lon +180 da la vuelta a 0.
    expect(tileDeLonLat(-180, 0, 0)).toEqual({ x: 0, y: 0 });
    // En z1 la lat 0 cae exactamente en el borde entre filas (mercY = lado/2).
    expect(tileDeLonLat(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(tileDeLonLat(-90, 0, 2)).toEqual({ x: 1, y: 2 });
    // lat 45°N queda en la mitad norte (y pequeña), lat 45°S en la sur.
    const norte = tileDeLonLat(90, 45, 2);
    const sur = tileDeLonLat(90, -45, 2);
    expect(norte.x).toBe(3);
    expect(norte.y).toBeLessThan(sur.y);
    // El límite mercator recorta los polos: 85,05°N → fila 0, 85,05°S → última.
    expect(tileDeLonLat(0, LAT_LIMITE, 2).y).toBe(0);
    expect(tileDeLonLat(0, -LAT_LIMITE, 2).y).toBe(3);
    expect(tileDeLonLat(0, 90, 2).y).toBe(0);
    expect(tileDeLonLat(0, -90, 2).y).toBe(3);
  });
});

describe("tilesSatelite — niveles por distancia (ROADMAP 1.4.1)", () => {
  it("elige el nivel por distancia: z0-z2 con los umbrales de 1.3.1 y z3/z4 de contacto", () => {
    expect(zoomParaDistancia(6)).toBe(0);
    expect(zoomParaDistancia(2.9)).toBe(1);
    expect(zoomParaDistancia(1.8)).toBe(3); // entre el umbral de z4 y el de z3
    expect(zoomParaDistancia(1.94)).toBe(2); // dentro de la banda de z3, ya en z2 puro
  });

  it("en el zoom de contacto (cámara a 1.4) entra el nivel de atlas de vista (z6)", () => {
    expect(zoomParaDistancia(1.2)).toBe(6);
    expect(zoomParaDistancia(0.5)).toBe(6);
    // El techo lo pone el nivel de la escalera, no un 4 fijo: z6 es el más detallado.
    expect(zoomParaDistancia(1.4)).toBe(6);
    expect(estaEnEscalera(6)).toBe(true);
    expect(estaEnEscalera(5)).toBe(false); // el 5 no está en la escalera
    // Solo los niveles de vista son cap: z0-z4 son atlas del mundo entero.
    expect(esCap(6)).toBe(true);
    expect(esCap(4)).toBe(false);
  });

  it("lejos (≥ 4.5) no cruza: solo el nivel 0", () => {
    expect(nivelesConFade(6)).toEqual({ zoomA: 0, zoomB: 0, peso: 0 });
  });

  it("la banda [3.6, 4.5) cruza z1 → z0 con peso creciente", () => {
    const inicio = nivelesConFade(3.6);
    const medio = nivelesConFade(4.05);
    const fin = nivelesConFade(4.4);
    expect(inicio).toEqual({ zoomA: 1, zoomB: 0, peso: 0 });
    expect(medio.zoomA).toBe(1);
    expect(medio.zoomB).toBe(0);
    expect(medio.peso).toBeGreaterThan(0.4);
    expect(medio.peso).toBeLessThan(0.6);
    expect(fin.peso).toBeGreaterThan(0.85);
  });

  it("la banda [2.2, 2.75) cruza z2 → z1 con peso creciente", () => {
    const inicio = nivelesConFade(2.2);
    const medio = nivelesConFade(2.475);
    expect(inicio).toEqual({ zoomA: 2, zoomB: 1, peso: 0 });
    expect(medio.peso).toBeGreaterThan(0.4);
    expect(medio.peso).toBeLessThan(0.6);
  });

  it("la banda [1.5, 1.65) funde el atlas de vista (z6) con el atlas global z4", () => {
    // z6 entra a 1.5 (allí ya es puro) y su banda nominal sería 1.875, recortada al
    // umbral de z4: al alejarse el peso del atlas de vista crece de 0 a 1 y a los 1.65
    // el globo vuelve al atlas del mundo entero. z4 ya nunca se ve solo: siempre está
    // fundido con z3 por arriba o con el cap por abajo.
    expect(nivelesConFade(1.5)).toEqual({ zoomA: 6, zoomB: 4, peso: 0 });
    expect(nivelesConFade(1.575).peso).toBeCloseTo(0.5, 2);
    expect(nivelesConFade(1.64).peso).toBeGreaterThan(0.9);
    expect(nivelesConFade(1.65)).toEqual({ zoomA: 4, zoomB: 3, peso: 0 });
    // En su zona pura el cruce es consigo mismo: el cap se pinta entero.
    expect(nivelesConFade(1.4)).toEqual({ zoomA: 6, zoomB: 6, peso: 0 });
  });

  it("la banda [1.9, 2.2) cruza z3 → z2, recortada para no invadir z2", () => {
    // z3 entra a 1.9 y su banda nominal sería 1.9×1.25=2.375, pero se recorta al
    // umbral de z2 (2.2): a los 2.15 ya se está casi en z2, no mezclando a medias,
    // y a los 2.2 la banda de z3 ha terminado.
    const inicio = nivelesConFade(1.9);
    expect(inicio.zoomA).toBe(3);
    expect(inicio.zoomB).toBe(2);
    expect(inicio.peso).toBeCloseTo(0, 5);
    expect(nivelesConFade(2.05).peso).toBeCloseTo(0.5, 2);
    expect(nivelesConFade(2.15).peso).toBeCloseTo(5 / 6, 2);
    // A los 2.2 termina la banda de z3 y arranca la de z2 → z1 (peso 0: aún z2 puro).
    expect(nivelesConFade(2.2)).toEqual({ zoomA: 2, zoomB: 1, peso: 0 });
  });

  it("la banda [1.65, 1.9) cruza z4 → z3", () => {
    const inicio = nivelesConFade(1.65);
    expect(inicio.zoomA).toBe(4);
    expect(inicio.zoomB).toBe(3);
    expect(inicio.peso).toBeCloseTo(0, 5);
    expect(nivelesConFade(1.775).peso).toBeCloseTo(0.5, 2);
  });
});

describe("tilesSatelite — atlas de vista (cap de z6)", () => {
  /** Medio fov horizontal que resulta del vertical (45°) con el aspecto 16:9 de la app. */
  const MEDIO_FOV_H =
    (Math.atan(Math.tan(((FOV / 2) * Math.PI) / 180) * ASPECTO_16_9) * 180) /
    Math.PI;

  it("el arco de pantalla se estrecha al acercarse y topa en el limbo", () => {
    // A 1.4 radios (zoom de contacto) media pantalla cubre ~9,9° de latitud...
    expect(arcoEnPantalla(1.4, FOV / 2)).toBeCloseTo(9.895, 2);
    // ...y con el medio fov horizontal son ~19,7° de longitud: el marco es más ancho
    // que alto, que es lo que hace que el rectángulo de tiles salga apaisado.
    expect(MEDIO_FOV_H).toBeCloseTo(36.367, 2);
    expect(arcoEnPantalla(1.4, MEDIO_FOV_H)).toBeCloseTo(19.746, 2);
    // A 2.2 radios el marco ya abarca el limbo entero: eso pide un atlas global.
    expect(arcoEnPantalla(2.2, MEDIO_FOV_H)).toBe(90);
    expect(arcoEnPantalla(6, FOV / 2)).toBe(90);
    // Monótono: más cerca, menos arco que hay que cubrir.
    expect(arcoEnPantalla(1.65, FOV / 2)).toBeGreaterThan(
      arcoEnPantalla(1.4, FOV / 2),
    );
  });

  it("el centro de la vista es la lat/lon que la cámara tiene debajo", () => {
    expect(centroVista(0, 0, 1)).toEqual({ lat: 0, lon: 0 });
    // Iberian peninsula: 40°N, 4°O.
    const peninsula = centroVista(-0.0534, 0.643, 0.764);
    expect(peninsula.lat).toBeCloseTo(40, 1);
    expect(peninsula.lon).toBeCloseTo(-4, 1);
    // Alejar la cámara no cambia el punto que tiene debajo (es una dirección).
    expect(centroVista(-0.1602, 1.929, 2.292).lat).toBeCloseTo(
      peninsula.lat,
      6,
    );
    expect(centroVista(-0.1602, 1.929, 2.292).lon).toBeCloseTo(
      peninsula.lon,
      6,
    );
  });

  it("el rectángulo cubre el centro con holgura y sale apaisado", () => {
    const rect = rectDeCap(6, { lat: 0, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9);
    // 12×8 tiles: 96 en vez de los 4096 de un atlas global de z6, en un atlas 3072×2048.
    expect(rect).toEqual({ z: 6, x0: 26, y0: 28, cols: 12, rows: 8 });
    // El centro cae dentro del rectángulo.
    const centro = tileDeLonLat(0, 0, 6);
    expect(centro.x).toBeGreaterThanOrEqual(rect.x0);
    expect(centro.x).toBeLessThan(rect.x0 + rect.cols);
    expect(centro.y).toBeGreaterThanOrEqual(rect.y0);
    expect(centro.y).toBeLessThan(rect.y0 + rect.rows);
    // Apaisado (el marco también) y más barato que el atlas global de z4.
    expect(rect.cols).toBeGreaterThan(rect.rows);
    expect(rect.cols * rect.rows).toBeLessThan(256);
    expect(rect.cols * 256).toBeLessThanOrEqual(4096);
    expect(rect.rows * 256).toBeLessThanOrEqual(4096);
  });

  it("el rectángulo sigue a la cámara y da la vuelta al mundo por el este", () => {
    const origen = rectDeCap(6, { lat: 0, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9);
    const este = rectDeCap(6, { lat: 0, lon: 20 }, 1.4, FOV / 2, ASPECTO_16_9);
    expect(este.x0).toBeGreaterThan(origen.x0);
    // Cerca del antimeridiano el rectángulo se sale por la derecha: las columnas dan
    // la vuelta al mundo, así que se envuelve en lugar de recortarse.
    const vuelta = rectDeCap(
      6,
      { lat: 0, lon: -179 },
      1.4,
      FOV / 2,
      ASPECTO_16_9,
    );
    expect(vuelta.x0 + vuelta.cols).toBeGreaterThan(64);
  });

  it("cerca de los polos el rectángulo se estira en vertical y topa en el techo", () => {
    const ecuador = rectDeCap(
      6,
      { lat: 0, lon: 0 },
      1.4,
      FOV / 2,
      ASPECTO_16_9,
    );
    const media = rectDeCap(6, { lat: 60, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9);
    const polo = rectDeCap(6, { lat: 80, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9);
    expect(media.rows).toBeGreaterThan(ecuador.rows);
    expect(polo.rows).toBeGreaterThan(media.rows);
    expect(polo.rows).toBe(16); // tope de 4096 px por eje
    // Y nunca se sale del nivel.
    expect(polo.y0).toBeGreaterThanOrEqual(0);
    expect(polo.y0 + polo.rows).toBeLessThanOrEqual(64);
  });

  it("uvDeCap da el rectángulo mercator que viaja al uniform del shader", () => {
    const uv = uvDeCap(
      rectDeCap(6, { lat: 0, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9),
    );
    expect(uv.u0).toBeCloseTo(26 / 64, 6);
    expect(uv.v0).toBeCloseTo(28 / 64, 6);
    expect(uv.ancho).toBeCloseTo(12 / 64, 6);
    expect(uv.alto).toBeCloseTo(8 / 64, 6);
  });

  it("vMercator: norte 0, ecuador 0,5 y recortada en el límite del esquema", () => {
    expect(vMercator(LAT_LIMITE)).toBeCloseTo(0, 5);
    expect(vMercator(0)).toBeCloseTo(0.5, 5);
    expect(vMercator(-LAT_LIMITE)).toBeCloseTo(1, 5);
    expect(vMercator(90)).toBeCloseTo(0, 5);
  });
});

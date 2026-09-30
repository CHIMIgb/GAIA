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
  ladoDeZoom,
  nivelesConFade,
  tileDeLonLat,
  urlTileEsri,
  zoomParaDistancia,
} from "../../src/utils/tilesSatelite";

describe("tilesSatelite — URL y geometría (ROADMAP 1.4.1)", () => {
  it("arma la URL de Esri con el orden {z}/{y}/{x} del doc §1.1", () => {
    expect(urlTileEsri(2, 1, 3)).toBe(
      "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/3",
    );
  });

  it("el lado del nivel es 2^zoom (1, 2, 4)", () => {
    expect(ladoDeZoom(0)).toBe(1);
    expect(ladoDeZoom(1)).toBe(2);
    expect(ladoDeZoom(2)).toBe(4);
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
  it("elige el nivel por distancia, alineado con el LOD de elevación", () => {
    expect(zoomParaDistancia(6)).toBe(0);
    expect(zoomParaDistancia(2.9)).toBe(1);
    expect(zoomParaDistancia(1.2)).toBe(2);
    expect(zoomParaDistancia(0.5)).toBe(2);
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

  it("cerca (< 2.2) usa solo el nivel 2", () => {
    expect(nivelesConFade(1.2)).toEqual({ zoomA: 2, zoomB: 2, peso: 0 });
  });
});

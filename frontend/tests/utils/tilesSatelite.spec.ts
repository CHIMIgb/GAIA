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
    expect(zoomParaDistancia(1.2)).toBe(4); // el zoom de contacto (cámara a 1.4)
    expect(zoomParaDistancia(0.5)).toBe(4);
    expect(zoomParaDistancia(1.8)).toBe(3); // entre el umbral de z4 y el de z3
    expect(zoomParaDistancia(1.94)).toBe(2); // dentro de la banda de z3, ya en z2 puro
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

  it("cerca (< 1.65) usa solo el nivel 4, el de contacto", () => {
    expect(nivelesConFade(1.2)).toEqual({ zoomA: 4, zoomB: 4, peso: 0 });
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

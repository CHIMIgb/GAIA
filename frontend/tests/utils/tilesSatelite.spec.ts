/**
 * Matemática de tiles satelitales (ROADMAP 1.4.1).
 *
 * El fragment shader muestrea el atlas en coordenadas mercator; esta matemática
 * es el espejo CPU que se puede validar sin GPU (misma fórmula que el fragment shader):
 * nivel por distancia, tile por lat/lon, URL del proveedor y cruce suave.
 */
import { describe, expect, it } from "vitest";

import {
  LAT_LIMITE,
  LADO_MAX_CAP,
  PXS_MAX_CAP,
  arcoEnPantalla,
  centroVista,
  columnaDeAtlas,
  esCap,
  estaEnEscalera,
  ladoDeZoom,
  nivelesConFade,
  rectDeCap,
  tileDeLonLat,
  urlTileEsri,
  uvDeCap,
  uvLocal,
  vMercator,
  zoomDeCap,
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
  it("elige el nivel por distancia: z4 cubre el encuadre de arranque y el cap el zoom", () => {
    expect(zoomParaDistancia(7)).toBe(0);
    expect(zoomParaDistancia(5)).toBe(2);
    expect(zoomParaDistancia(4)).toBe(3);
    expect(zoomParaDistancia(3)).toBe(4);
    // El encuadre del planeta entero (`distanciaDeEncuadre`) cae en 2,83–2,92 y tiene que
    // caer en z4 (11,4 px/grado) para no arrancar borroso: a 2,9 el disco pide 8,9.
    expect(zoomParaDistancia(2.83)).toBe(4);
    expect(zoomParaDistancia(2.87)).toBe(4);
    expect(zoomParaDistancia(2.92)).toBe(4);
    expect(zoomParaDistancia(2.6)).toBe(4);
    // Por debajo de 2,5 el rectángulo de vista se come los polos y manda el atlas de vista.
    expect(zoomParaDistancia(2.4)).toBe(6);
    expect(zoomParaDistancia(1.8)).toBe(6);
    expect(zoomParaDistancia(1.25)).toBe(6); // el zoom máximo de la cámara
  });

  it("z4 está en la escalera como atlas global y z6 como atlas de vista", () => {
    expect(estaEnEscalera(4)).toBe(true);
    expect(esCap(4)).toBe(false);
    expect(estaEnEscalera(6)).toBe(true);
    expect(esCap(6)).toBe(true);
    // El nivel del cap lo elige `zoomDeCap` (z5 al entrar, z8 en el zoom máximo), no un
    // número fijo de la escalera.
    expect(zoomParaDistancia(1.9)).toBe(6);
    expect(zoomParaDistancia(1.4)).toBe(6);
  });

  it("la banda [2,8; 3,4) funde z4 con z3 y a 3,4 ya es z3 puro", () => {
    const medio = nivelesConFade(3.1);
    expect(medio.zoomA).toBe(4);
    expect(medio.zoomB).toBe(3);
    expect(medio.peso).toBeCloseTo(0.5, 2);
    expect(nivelesConFade(3.35).peso).toBeGreaterThan(0.85);
    // A 3,4 z3 ya es puro (peso 0), aunque el atlas de reserva sea z2.
    expect(nivelesConFade(3.4)).toEqual({ zoomA: 3, zoomB: 2, peso: 0 });
  });

  it("la banda [2, 2,5) funde el atlas de vista (z6) con el atlas global z4", () => {
    // El cap entra a 2 radios y su banda nominal sería 2,5, recortada al umbral de z4
    // (2,8): al alejarse el peso del atlas de vista crece de 0 a 1 y a los 2,5 el globo
    // vuelve al atlas del mundo entero, sin mezclarse a medias.
    expect(nivelesConFade(2)).toEqual({ zoomA: 6, zoomB: 4, peso: 0 });
    expect(nivelesConFade(2.25).peso).toBeCloseTo(0.5, 2);
    expect(nivelesConFade(2.45).peso).toBeGreaterThanOrEqual(0.9);
    expect(nivelesConFade(2.5)).toEqual({ zoomA: 4, zoomB: 4, peso: 0 });
    // En su zona pura el cruce es consigo mismo: el cap se pinta entero.
    expect(nivelesConFade(1.8)).toEqual({ zoomA: 6, zoomB: 6, peso: 0 });
  });

  it("el encuadre de arranque sale casi puro en z4, sin apagarse con el cruce", () => {
    // El caso que reportó el usuario: si el encuadre cayera en la banda, el peso de z3
    // rebajaría la densidad de salida. A 2,83–2,92 el peso va de 0,05 a 0,2.
    expect(nivelesConFade(2.83).peso).toBeCloseTo(0.05, 2);
    expect(nivelesConFade(2.92).peso).toBeCloseTo(0.2, 2);
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
    const filas = (lat: number) =>
      rectDeCap(6, { lat, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9).rows;
    expect(filas(60)).toBeGreaterThan(filas(0));
    expect(filas(80)).toBeGreaterThan(filas(60));
    // En mercator el alto se dispara hacia latitudes altas (~75°): ahí lo que corta es el
    // techo del atlas (24 tiles de 256 px = 6144 px), no el nivel. Más al norte el alto
    // vuelve a encogerse porque la proyección se aplana en el límite del esquema.
    expect(filas(75)).toBe(LADO_MAX_CAP);
    // Y nunca se sale del nivel.
    const polo = rectDeCap(6, { lat: 75, lon: 0 }, 1.4, FOV / 2, ASPECTO_16_9);
    expect(polo.y0).toBeGreaterThanOrEqual(0);
    expect(polo.y0 + polo.rows).toBeLessThanOrEqual(64);
  });

  it("el nivel del cap sube al acercarse y lo tops el atlas, no el zoom", () => {
    const centro = { lat: 0, lon: 0 };
    const z = (distancia: number, px = 256) =>
      zoomDeCap(centro, distancia, FOV / 2, ASPECTO_16_9, px);
    // En el contacto el atlas da para z7 (91 px/grado, lo que pide un DPR 2); más lejos
    // el marco abierto no cabe y baja a z6. z8 no sale nunca: pediría ~8448 px por eje.
    expect(z(1.4)).toBe(7);
    expect(z(1.5)).toBe(7);
    expect(z(1.55)).toBe(6);
    expect(z(1.65)).toBe(6);
    const rect = rectDeCap(z(1.4), centro, 1.4, FOV / 2, ASPECTO_16_9);
    expect(rect.cols * 256).toBeLessThanOrEqual(PXS_MAX_CAP);
    expect(rect.rows * 256).toBeLessThanOrEqual(PXS_MAX_CAP);
    // Con tiles de 512 px el mismo atlas llega a la misma densidad un nivel más abajo:
    // lo que manda es el ancho del tile, no cuántos se piden.
    expect(z(1.4, 512)).toBe(6);
    expect(z(1.65, 512)).toBe(5);
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

describe("uvLocal — UV del atlas de vista sin costuras (ROADMAP 1.4.2)", () => {
  const LADO = ladoDeZoom(6); // 64 columnas
  const rect = (lat: number, lon: number) =>
    rectDeCap(6, { lat, lon }, 1.4, FOV / 2, ASPECTO_16_9);
  const uv = (lat: number, lon: number) => uvDeCap(rect(lat, lon));

  it("dentro del rectángulo la uv local es la posición proporcional en el atlas", () => {
    const r = uv(0, 0); // z6, lon 0: u0=26/64, v0=28/64, 12×8 tiles
    // Las esquinas del rectángulo son las del atlas: nada de margen, nada de recorte.
    expect(uvLocal({ u: r.u0, v: r.v0 }, r)).toEqual({ u: 0, v: 0 });
    expect(uvLocal({ u: r.u0 + r.ancho, v: r.v0 + r.alto }, r)).toEqual({
      u: 1,
      v: 1,
    });
    // El centro del ecuador cae en el centro del atlas de vista.
    const centro = uvLocal({ u: r.u0 + r.ancho / 2, v: 0.5 }, r)!;
    expect(centro.u).toBeCloseTo(0.5, 6);
    expect(centro.v).toBeCloseTo(0.5, 6);
  });

  it("fuera del rectángulo devuelve null para que el shader caiga al atlas global", () => {
    const r = uv(0, 0);
    // Los cuatro lados, con un tic de margen: lo que no cubre el atlas de vista no
    // existe en él, así que el shader tiene que saber que no puede muestrearlo.
    const uCentro = (r.u0 + r.ancho) / 2;
    expect(uvLocal({ u: r.u0 - 1 / LADO, v: 0.5 }, r)).toBeNull();
    expect(uvLocal({ u: r.u0 + r.ancho + 1 / LADO, v: 0.5 }, r)).toBeNull();
    expect(uvLocal({ u: uCentro, v: r.v0 - 1 / LADO }, r)).toBeNull();
    expect(uvLocal({ u: uCentro, v: r.v0 + r.alto + 1 / LADO }, r)).toBeNull();
  });

  it("un atlas del mundo entero se muestrea tal cual, sin desplazamiento", () => {
    const mundo = { u0: 0, v0: 0, ancho: 1, alto: 1 };
    expect(uvLocal({ u: 0.3, v: 0.7 }, mundo)).toEqual({ u: 0.3, v: 0.7 });
  });

  it("el rectángulo que cruza el antimeridiano también cubre su mitad envuelta", () => {
    // Cerca de lon 180 el rectángulo se sale por la derecha (u0 + ancho > 1): las
    // columnas de la vuelta están en el atlas, en su orden, pero en el lado oeste del
    // mundo (u < u0). Si no se les devuelve la vuelta, el shader las pinta con el atlas
    // global y aparece un escalón de nitidez en el borde fecha.
    const rc = rect(0, -179);
    const r = uvDeCap(rc);
    expect(r.u0 + r.ancho).toBeGreaterThan(1);
    const vMedio = r.v0 + r.alto / 2;
    // u=0 es la columna x=0 del mundo, la primera de las envueltas: su columna en el
    // atlas es la que le toca (`columnaDeAtlas`), no la primera del atlas.
    const oeste = uvLocal({ u: 0, v: vMedio }, r)!;
    expect(oeste.u).toBeCloseTo(columnaDeAtlas(0, rc.x0, LADO) / rc.cols, 6);
    expect(oeste.u).toBeCloseTo(0.5, 6); // sexta columna de doce: el centro del atlas
    // La vuelta es continua: la última columna envuelta (x=5) llega al final del atlas,
    // sin hueco ni solapamiento con la primera del rectángulo (u=u0, uv 0).
    expect(uvLocal({ u: 5 / LADO, v: vMedio }, r)!.u).toBeCloseTo(
      11 / rc.cols,
      6,
    );
    expect(uvLocal({ u: r.u0, v: vMedio }, r)!.u).toBeCloseTo(0, 6);
    // Y el borde este del rectángulo sigue en su sitio.
    expect(
      uvLocal({ u: r.u0 + r.ancho - 1 / LADO, v: vMedio }, r)!.u,
    ).toBeCloseTo(1 - 1 / rc.cols, 6);
    // Pasado el borde de la vuelta (x=5), lo que queda hasta u0 es el limbo: ahí el
    // atlas de vista no llega y se cae al global, en vez de muestrear la vuelta
    // equivocada del propio atlas de vista.
    expect(uvLocal({ u: 6 / LADO, v: vMedio }, r)!.u).toBeCloseTo(1, 6);
    expect(uvLocal({ u: 7 / LADO, v: vMedio }, r)).toBeNull();
    expect(uvLocal({ u: r.u0 - 1 / LADO, v: vMedio }, r)).toBeNull();
  });

  it("la vuelta es solo en u: en v no hay wrap, el alto del atlas no se desborda", () => {
    // El ecuador y los polos van por la misma regla que cualquier otra latitud: la
    // columna de tiles es la de vMercator, recortada al nivel, sin dar la vuelta.
    for (const lat of [0, 60, 80, -80]) {
      const r = uv(lat, 0);
      const uCentro = r.u0 + r.ancho / 2;
      // El punto que la cámara tiene debajo cae dentro del atlas de vista, y no pegado
      // a su borde (el rectángulo se recorta a 24 filas cerca de los polos).
      const centro = uvLocal({ u: uCentro, v: vMercator(lat) }, r);
      expect(centro).not.toBeNull();
      expect(centro!.v).toBeGreaterThan(0);
      expect(centro!.v).toBeLessThan(1);
      // Un tile por encima o por debajo ya está fuera: en v la latitud no da la vuelta.
      expect(uvLocal({ u: uCentro, v: r.v0 - 1 / LADO }, r)).toBeNull();
      expect(
        uvLocal({ u: uCentro, v: r.v0 + r.alto + 1 / LADO }, r),
      ).toBeNull();
    }
  });
});

describe("columnaDeAtlas — empaquetado de las columnas del cap (ROADMAP 1.4.2)", () => {
  it("en un atlas global la columna del atlas es la del tile", () => {
    expect(columnaDeAtlas(0, 0, 16)).toBe(0);
    expect(columnaDeAtlas(7, 0, 16)).toBe(7);
  });

  it("con el rectángulo envuelto, las columnas de la vuelta caen dentro del atlas", () => {
    // z6 son 64 columnas: con x0=59 y 8 columnas entran 59..63 y 0, 1 y 2. Las últimas
    // tres van al final del atlas, en orden; dibujarlas en (x - x0) las sacaría del
    // lienzo por la izquierda (negativo) y dejaría tres huecos.
    expect(columnaDeAtlas(59, 59, 64)).toBe(0);
    expect(columnaDeAtlas(63, 59, 64)).toBe(4);
    expect(columnaDeAtlas(0, 59, 64)).toBe(5);
    expect(columnaDeAtlas(2, 59, 64)).toBe(7);
  });

  it("la vuelta es por el mundo (2^z), no por el número de columnas del atlas", () => {
    // El caso que sale en z6 mirando el borde fecha: 12 columnas desde x0=58 entran 58..63
    // y 0..5. El tile x=0 es la sexta del atlas (la vuelta cae en 64, no en 12).
    expect(columnaDeAtlas(0, 58, 64)).toBe(6);
    expect(columnaDeAtlas(5, 58, 64)).toBe(11);
    expect(columnaDeAtlas(58, 58, 64)).toBe(0);
  });

  it("ninguna columna se sale del atlas, ni la última ni la primera", () => {
    // Las columnas que pide `TileManager` son `(x0 + col) % lado` para col < cols: la
    // vuelta tiene que devolverlas al su sitio en el atlas, en orden y sin salirse.
    for (let col = 0; col < 8; col++)
      for (let x0 = 60; x0 < 64; x0++) {
        const enAtlas = columnaDeAtlas((x0 + col) % 64, x0, 64);
        expect(enAtlas).toBe(col);
        expect(enAtlas).toBeGreaterThanOrEqual(0);
        expect(enAtlas).toBeLessThan(8);
      }
  });
});

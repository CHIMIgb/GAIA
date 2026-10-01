/**
 * Geoide base (ROADMAP 1.2.1).
 *
 * El criterio del paso tiene dos mitades: que la esfera se vea con detalle y que las
 * normales sean correctas. La segunda se comprueba aquí de forma exacta, no mirando una
 * captura: en una esfera de radio 1 la normal analítica de cada vértice es su posición
 * normalizada, así que se puede verificar vértice a vértice. Si alguien reconstruye las
 * normales con `computeVertexNormals()` o pone `flatShading`, el test se pone rojo.
 *
 * La primera mitad (que no se vean bandas) es visual y la comprueba `tests/fps/fps.spec.ts`
 * en navegador.
 */
import {
  DataTexture,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ESCALA_ELEVACION,
  MALLAS,
  NIVEL_MAR,
} from "../../../src/modules/globe/ElevationLOD";
import { GlobeModule } from "../../../src/modules/globe/GlobeModule";

const montado = () => {
  const escena = new Scene();
  const globo = new GlobeModule(escena);
  return { escena, globo, malla: globo.malla };
};

/** Heightmap falso de 1x1: los tests de cableado no necesitan PNG ni red. */
const texturaFalsa = () => {
  const t = new DataTexture(new Uint8Array([0, 128, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};

/** Cámara a una distancia del centro, que es lo único que mira el LOD. */
const camaraEn = (distancia: number) => {
  const camara = new PerspectiveCamera(45, 1, 0.1, 100);
  camara.position.set(0, 0, distancia);
  return camara;
};

describe("GlobeModule — geoide base (ROADMAP 1.2.1)", () => {
  it("es una esfera de radio 1", () => {
    const { malla } = montado();

    // Radio 1 es el contrato con 1.2.2 y 1.3: la atmósfera es una esfera concéntrica
    // mayor y el displacement se mide en radios, no en kilómetros.
    expect(malla.geometry).toBeInstanceOf(SphereGeometry);
    malla.geometry.computeBoundingSphere();
    expect(malla.geometry.boundingSphere?.radius).toBeCloseTo(1, 5);
  });

  it("usa normales analíticas, no caras planas", () => {
    const { malla } = montado();
    const { position, normal } = malla.geometry.attributes;
    const v = new Vector3();
    const n = new Vector3();

    // Se muestrean vértices en vez de recorrer los ~16 000: la condición es la misma en
    // todos y el test baja de 100 ms a menos de 5.
    for (let i = 0; i < position.count; i += 97) {
      v.fromBufferAttribute(position, i).normalize();
      n.fromBufferAttribute(normal, i);
      expect(n.dot(v)).toBeCloseTo(1, 5);
    }
  });

  it("no fuerza sombreado plano", () => {
    const { malla } = montado();
    const material = malla.material as { flatShading?: boolean };

    // `flatShading` es exactamente lo que dibuja las bandas que el criterio prohíbe.
    expect(material.flatShading).toBeFalsy();
  });

  it("la silueta está dentro del píxel, que es donde se ven las bandas", () => {
    const { malla } = montado();
    const segmentos = (malla.geometry as SphereGeometry).parameters
      .widthSegments;

    // El criterio de 1.2.1 pide que no se vean bandas, y eso en una esfera lisa es una
    // sola cosa medible: el borde de la silueta. Un polígono de N lados inscritos en la
    // circunferencia se aleja de ella R·(1−cos(π/N)) en el centro de cada lado, y por
    // debajo del píxel no se ve.
    //
    // Se mide en el encuadre más grande posible —el limbo pegado al borde de una pantalla
    // de 1920, R = 960 px—, que es el peor caso al que se puede llegar moviendo la
    // cámara. Con los 32 segmentos por defecto de Three serían 4,6 px: un polígono
    // evidente. La malla de 1.2.1 (128) daba 0,29 px; desde 1.3.3 la más gruesa de la
    // escalera es 256, así que el criterio se cumple con más holgura (0,07 px).
    const apartamiento = 960 * (1 - Math.cos(Math.PI / segmentos));

    expect(apartamiento).toBeLessThan(0.5);
  });

  it("entra en la escena que recibe", () => {
    const { escena, malla } = montado();

    expect(escena.children).toContain(malla);
    expect(malla).toBeInstanceOf(Mesh);
  });

  it("el material es el shader de atmósfera desde 1.2.2", () => {
    const { globo, malla } = montado();

    // 1.2.2 sustituye al `MeshStandardMaterial` de 1.2.1. Si esto vuelve a
    // `MeshStandardMaterial`, el resplandor del limbo lo pintaría la luz de Three y
    // el shader deja de hacer nada (la iluminación uniforme y el limbo viven en él).
    expect(malla.material).toBe(globo.atmosfera.material);
    expect(malla.material.type).toBe("ShaderMaterial");
  });

  it("sigue siendo una sola malla tras meter la atmósfera", () => {
    const { escena } = montado();

    // La atmósfera de 1.2.2 se eligió como shader único precisamente para no sumar
    // draw calls: una cáscara exterior aparte serían 2. El techo de 8 aguanta las dos,
    // así que esto es una decisión, no un límite.
    expect(escena.children).toHaveLength(1);
  });

  it("al destruirse se va de la escena y suelta la GPU", () => {
    const { escena, globo, malla } = montado();
    const geometria = malla.geometry;
    const material = malla.material as { dispose: () => void };
    const espias = [
      vi.spyOn(geometria, "dispose"),
      vi.spyOn(material, "dispose"),
    ];

    globo.dispose();

    expect(escena.children).not.toContain(malla);
    for (const espia of espias) expect(espia).toHaveBeenCalled();
  });
});

/**
 * Elevación por LOD (ROADMAP 1.3.1).
 *
 * `cargarElevacion()` no toca red ni decodifica PNG: recibe las texturas ya hechas y
 * solo enchufa uniforms + reparte el peso por frame. Los tests montan texturas de 1x1
 * y comprueban el cableado; que el relieve *se vea* lo comprueba el navegador.
 */
describe("GlobeModule — elevación por LOD (ROADMAP 1.3.1)", () => {
  it("cargarElevacion enciende el displacement con la escala canónica", () => {
    const { globo } = montado();
    const baja = texturaFalsa();
    const alta = texturaFalsa();

    globo.cargarElevacion(baja, alta);

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    expect(u.nivelBajo.value).toBe(baja);
    expect(u.nivelAlto.value).toBe(alta);
    expect(u.escalaElevacion.value).toBe(ESCALA_ELEVACION);
    // 1.3.2: el mínimo de la elevación se fija desde la constante canónica.
    expect(u.nivelMar.value).toBe(NIVEL_MAR);
    // Por defecto está apagado (escala 0): sin cargarElevacion no hay relieve.
  });

  it("reparte el peso por frame según la distancia de la cámara", () => {
    const { globo } = montado();
    globo.cargarElevacion(texturaFalsa(), texturaFalsa());

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);

    camara.position.set(0, 0, 5);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBe(0);

    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBe(1);

    camara.position.set(0, 0, 2.9);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBeGreaterThan(0);
    expect(u.mezclaMedio.value).toBeLessThan(1);
  });

  it("sin cargarElevacion no hay desplazamiento", () => {
    const { globo } = montado();
    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    expect(u.escalaElevacion.value).toBe(0);
    expect(u.mezclaMedio.value).toBe(0);

    // El `onBeforeRender` base de Three es un no-op: invocarlo no toca el peso.
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBe(0);
  });

  it("al destruirse suelta las texturas y deja de tocar los uniforms", () => {
    const { globo } = montado();
    const baja = texturaFalsa();
    const alta = texturaFalsa();
    globo.cargarElevacion(baja, alta);

    const espias = [vi.spyOn(baja, "dispose"), vi.spyOn(alta, "dispose")];
    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);

    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBe(1);

    globo.dispose();
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.mezclaMedio.value).toBe(1);
    for (const espia of espias) expect(espia).toHaveBeenCalled();
  });
});

/**
 * Escalera de mallas del relieve (ROADMAP 1.3.3).
 *
 * `TerrainMesh` cambia de geometría al cruzar de peldaño, sin cambiar de malla ni de
 * material: los pasos 1.2.2 (atmósfera) y 1.4.1 (textura) se apoyan en una sola malla y un
 * solo material, así que la escalera no puede añadir un draw call. La geometría vieja se
 * suelta al sustituirla para no tener 36 MB de vértices de dos peldaños a la vez.
 */
// Timeout holgado: estos tests construyen mallas de verdad (la más fina, 1024×512, tarda
// ~2,5 s en jsdom, y bajo carga de CPU el límite por defecto de 5 s se queda corto).
describe(
  "GlobeModule — escalera de mallas del relieve (ROADMAP 1.3.3)",
  { timeout: 20_000 },
  () => {
    const segmentosDe = (malla: Mesh) => {
      const { widthSegments, heightSegments } = (
        malla.geometry as SphereGeometry
      ).parameters;
      return [widthSegments, heightSegments];
    };

    /** Monta el globo con el relieve encendido: sin él no hay LOD de malla que valga. */
    const conRelieve = () => {
      const { escena, globo, malla } = montado();
      globo.cargarElevacion(texturaFalsa(), texturaFalsa());
      const pintar = (distancia: number) =>
        globo.malla.onBeforeRender?.(
          null as never,
          escena,
          camaraEn(distancia),
        );
      return { escena, globo, malla, pintar };
    };

    it("hasta que el primer frame elige peldaño se queda con la más gruesa", () => {
      const { malla } = montado();
      expect(segmentosDe(malla)).toEqual([MALLAS[0].ancho, MALLAS[0].alto]);
    });

    it("el encuadre de arranque cambia al peldaño medio sin cambiar de malla", () => {
      const { globo, malla, pintar } = conRelieve();
      const material = malla.material;

      pintar(2.9);

      expect(segmentosDe(malla)).toEqual([MALLAS[1].ancho, MALLAS[1].alto]);
      // Misma malla y mismo material: la escalera no suma draw calls.
      expect(globo.malla).toBe(malla);
      expect(malla.material).toBe(material);
    });

    it("de cerca cambia a la más fina", () => {
      const { pintar, malla } = conRelieve();

      pintar(1.2);

      expect(segmentosDe(malla)).toEqual([MALLAS[2].ancho, MALLAS[2].alto]);
    });

    it("al cambiar de peldaño suelta la geometría vieja", () => {
      const { pintar, malla } = conRelieve();
      const vieja = malla.geometry;
      const espia = vi.spyOn(vieja, "dispose");

      pintar(1.2);

      expect(malla.geometry).not.toBe(vieja);
      expect(espia).toHaveBeenCalled();
    });

    it("dentro de un peldaño no reconstruye la geometría", () => {
      const { pintar, malla } = conRelieve();
      pintar(2.9);
      const actual = malla.geometry;
      const espia = vi.spyOn(actual, "dispose");

      // Dos distancias dentro de la misma banda (2,2–3,6).
      pintar(2.6);
      pintar(3.0);

      expect(espia).not.toHaveBeenCalled();
      expect(malla.geometry).toBe(actual);
    });

    it("el peldaño más grueso cumple el criterio de silueta de 1.2.1", () => {
      // El peldaño más grueso es el que se ve de lejos: si él cumple, los otros dos también.
      expect(960 * (1 - Math.cos(Math.PI / MALLAS[0].ancho))).toBeLessThan(0.5);
    });
  },
);

/**
 * DEM z3 del runtime (ROADMAP 1.3.3).
 *
 * El tercer nivel no cambia el material ni añade malla: `TileManager` compone el atlas
 * Terrarium z3 y `GlobeModule` lo enchufa como tercer sampler. Aquí se comprueba el
 * cableado con un `TileManager` de mentira (el atlas de verdad son 64 tiles de red y lo
 * cubre el navegador): que la textura llega a `nivelAlto`, que la rampa se parte en
 * mitades y que si la descarga cae el relieve se queda con el asset z2 de 1.3.1.
 */
const { cargarRelieveFalso, precargarFalso } = vi.hoisted(() => ({
  cargarRelieveFalso: vi.fn(),
  precargarFalso: vi.fn(),
}));
vi.mock("../../../src/modules/globe/TileManager", () => ({
  TileManager: class {
    precargar = precargarFalso;
    cargarRelieve = cargarRelieveFalso;
    sincronizar = vi.fn();
    dispose = vi.fn();
  },
}));

describe("GlobeModule — DEM z3 del runtime (ROADMAP 1.3.3)", () => {
  beforeEach(() => {
    cargarRelieveFalso.mockReset();
    precargarFalso.mockReset();
  });

  it("cargarElevacion acepta el tercer nivel y parte la rampa en mitades", () => {
    const { escena, globo } = montado();
    const baja = texturaFalsa();
    const media = texturaFalsa();
    const alta = texturaFalsa();
    globo.cargarElevacion(baja, media, alta);

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    expect(u.nivelBajo.value).toBe(baja);
    expect(u.nivelMedio.value).toBe(media);
    expect(u.nivelAlto.value).toBe(alta);

    const pintar = (d: number) =>
      globo.malla.onBeforeRender?.(null as never, escena, camaraEn(d));
    // A media rampa los dos pesos están vivos: `medio` ya saturó en 1 y `alto` va subiendo.
    pintar(2.6);
    expect(u.mezclaMedio.value).toBe(1);
    expect(u.pesoNivelAlto.value).toBeGreaterThan(0);
    expect(u.pesoNivelAlto.value).toBeLessThan(1);
    // Cerca del detalle máximo manda el z3.
    pintar(2.2);
    expect(u.mezclaMedio.value).toBe(1);
    expect(u.pesoNivelAlto.value).toBe(1);
    // De lejos la rampa es la de 1.3.1: z1 solo.
    pintar(4);
    expect(u.mezclaMedio.value).toBe(0);
    expect(u.pesoNivelAlto.value).toBe(0);
  });

  it("enlaza el DEM cuando la descarga termina, no antes", async () => {
    const { globo } = montado();
    const relieve = texturaFalsa();
    let resolver: (t: DataTexture | null) => void = () => {};
    cargarRelieveFalso.mockReturnValue(
      new Promise<DataTexture | null>((res) => (resolver = res)),
    );

    globo.cargarElevacion(texturaFalsa(), texturaFalsa());
    globo.iniciarTextura();

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    // Mientras el atlas no llega, el z2 sigue haciendo de tercero: nada roto.
    expect(cargarRelieveFalso).toHaveBeenCalledTimes(1);
    expect(u.nivelAlto.value).toBe(u.nivelMedio.value);

    resolver(relieve);
    await vi.waitFor(() => expect(u.nivelAlto.value).toBe(relieve));
    expect(u.nivelMedio.value).not.toBe(relieve);
  });

  it("si la descarga cae, el relieve se queda con el asset z2", async () => {
    const { globo } = montado();
    cargarRelieveFalso.mockResolvedValue(null);

    globo.cargarElevacion(texturaFalsa(), texturaFalsa());
    globo.iniciarTextura();
    // Un turno de reloj basta para que el await interno se resuelva.
    await new Promise((r) => setTimeout(r, 0));

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    expect(u.nivelAlto.value).toBe(u.nivelMedio.value);
    // Sin tercer nivel, la rampa de 1.3.1: `alto` no se enciende nunca.
    globo.malla.onBeforeRender?.(null as never, new Scene(), camaraEn(2.2));
    expect(u.pesoNivelAlto.value).toBe(0);
    expect(u.mezclaMedio.value).toBe(1);
  });
});

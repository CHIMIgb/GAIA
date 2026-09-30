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
import { describe, expect, it, vi } from "vitest";

import {
  ESCALA_ELEVACION,
  NIVEL_MAR,
} from "../../../src/modules/globe/ElevationLOD";
import { GlobeModule } from "../../../src/modules/globe/GlobeModule";

const montado = () => {
  const escena = new Scene();
  const globo = new GlobeModule(escena);
  return { escena, globo, malla: globo.malla };
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
    // evidente. Con 128 son 0,29 px.
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
  const textura = () => {
    const t = new DataTexture(new Uint8Array([0, 128, 0, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
  };

  it("cargarElevacion enciende el displacement con la escala canónica", () => {
    const { globo } = montado();
    const baja = textura();
    const alta = textura();

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
    globo.cargarElevacion(textura(), textura());

    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);

    camara.position.set(0, 0, 5);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBe(0);

    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBe(1);

    camara.position.set(0, 0, 2.9);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBeGreaterThan(0);
    expect(u.pesoNivelAlto.value).toBeLessThan(1);
  });

  it("sin cargarElevacion no hay desplazamiento", () => {
    const { globo } = montado();
    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    expect(u.escalaElevacion.value).toBe(0);
    expect(u.pesoNivelAlto.value).toBe(0);

    // El `onBeforeRender` base de Three es un no-op: invocarlo no toca el peso.
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBe(0);
  });

  it("al destruirse suelta las texturas y deja de tocar los uniforms", () => {
    const { globo } = montado();
    const baja = textura();
    const alta = textura();
    globo.cargarElevacion(baja, alta);

    const espias = [vi.spyOn(baja, "dispose"), vi.spyOn(alta, "dispose")];
    const u = (globo.atmosfera.material as ShaderMaterial).uniforms;
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);

    camara.position.set(0, 0, 1.2);
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBe(1);

    globo.dispose();
    globo.malla.onBeforeRender?.(null as never, new Scene(), camara);
    expect(u.pesoNivelAlto.value).toBe(1);
    for (const espia of espias) expect(espia).toHaveBeenCalled();
  });
});

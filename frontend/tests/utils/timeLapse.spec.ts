/**
 * Time-lapse de 30 s (ROADMAP 1.6.2).
 *
 * Aquí se prueban las dos preguntas del criterio —"≥ 50 FPS medio" y "sin subidas de memoria
 * sostenidas"— contra series sintéticas. La medición sobre el globo de verdad la hace el
 * `DevOverlay` en el navegador: `tests/fps/` es territorio de Playwright (se cuelga en este
 * entorno, sin GPU), así que un test de navegador no mediría el criterio: mediría su propia
 * cuenta.
 */
import { describe, expect, it } from "vitest";

import { registerDrawCallsSource } from "../../src/utils/frameStats";
import {
  DURACION_TIMELAPSE_MS,
  FPS_MINIMO_CRITERIO,
  TOLERANCIA_FUGA,
  formatearTimeLapse,
  hayFugaMemoria,
  leerMuestra,
  mediana,
  resumirTimeLapse,
  type MuestraMemoria,
} from "../../src/utils/timeLapse";

/** Una muestra de memoria. `null` = todavía no hay renderer. */
const muestra = (
  tMs: number,
  geometries: number | null,
  textures: number | null,
  drawCalls: number | null = 4,
): MuestraMemoria => ({ tMs, geometries, textures, drawCalls });

/** 30 muestras, una por segundo, con la memoria quieta: el caso sano. */
const quieta = (n = 30) =>
  Array.from({ length: n }, (_, i) => muestra(i * 1000, 4, 6));

/** Deltas de frame de `n` frames a `fps`. */
const framesA = (fps: number, n = 1800) =>
  Array.from({ length: n }, () => 1000 / fps);

/** Serie a 60 FPS con la memoria quieta, que es lo que se espera del globo solo. */
const perfecto = () => ({ deltas: framesA(60), muestras: quieta() });

describe("resumirTimeLapse — el criterio de 1.6.2", () => {
  it("acepta 30 s a 60 FPS con la memoria quieta", () => {
    const { deltas, muestras } = perfecto();
    const resumen = resumirTimeLapse(deltas, muestras);

    expect(resumen.cumpleCriterio).toBe(true);
    expect(resumen.fpsMedio).toBeGreaterThanOrEqual(FPS_MINIMO_CRITERIO);
    expect(resumen.p95Ms).toBeLessThan(18);
    expect(resumen.fugaMemoria).toBe(false);
    expect(resumen.memoria.geometrias.delta).toBe(0);
  });

  it("mide la duración y los draw calls del intervalo", () => {
    const resumen = resumirTimeLapse(
      framesA(60),
      quieta(30).map((m) =>
        muestra(m.tMs, m.geometries, m.textures, m.tMs === 0 ? 2 : 4),
      ),
    );

    expect(resumen.duracionMs).toBe(DURACION_TIMELAPSE_MS - 1000);
    expect(resumen.drawCallsMax).toBe(4);
  });

  it("rechaza menos de 50 FPS aunque la memoria esté perfecta", () => {
    const resumen = resumirTimeLapse(framesA(40), quieta());

    expect(resumen.fpsMedio).toBeLessThan(FPS_MINIMO_CRITERIO);
    expect(resumen.fugaMemoria).toBe(false);
    expect(resumen.cumpleCriterio).toBe(false);
  });

  it("rechaza 60 FPS con la memoria subiendo", () => {
    // Tres geometrías nuevas por segundo: la fuga del criterio, y la que daría un
    // `InstancedMesh` recreado por frame sin que los FPS se movieran.
    const fuga = Array.from({ length: 30 }, (_, i) =>
      muestra(i * 1000, 4 + i * 3, 6),
    );

    const resumen = resumirTimeLapse(framesA(60), fuga);

    expect(resumen.fpsMedio).toBeGreaterThanOrEqual(FPS_MINIMO_CRITERIO);
    expect(resumen.fugaMemoria).toBe(true);
    expect(resumen.memoria.geometrias.delta).toBe(87);
    expect(resumen.cumpleCriterio).toBe(false);
  });

  it("detecta la fuga en texturas aunque las geometrías no se mov", () => {
    const fugaTexturas = Array.from({ length: 30 }, (_, i) =>
      muestra(i * 1000, 4, 6 + i * 2),
    );

    expect(hayFugaMemoria(fugaTexturas)).toBe(true);
    expect(
      resumirTimeLapse(framesA(60), fugaTexturas).memoria.texturas.delta,
    ).toBe(58);
  });

  it("no llama fuga a lo que cabe en la tolerancia del recolector", () => {
    // Dos texturas de diferencia es lo que mueve recompilar un programa de Three: hay que
    // tolerarlo o el criterio daría por rota una escena sana.
    const ruido = Array.from({ length: 30 }, (_, i) =>
      muestra(i * 1000, 4, 6 + (i % 2 === 0 ? 0 : TOLERANCIA_FUGA)),
    );

    expect(resumirTimeLapse(framesA(60), ruido).fugaMemoria).toBe(false);
  });

  it("ignora un pico suelto: la fuga es sostenida, no un dispose puntual", () => {
    // Recompilar un shader sube el contador un instante y lo baja. Comparando medias —o el
    // primer punto contra el último— eso se lee como una caída o un tirón y el criterio se
    // decide por un evento que no es una fuga. Con medianas, no.
    const conPico = quieta(30).map((m) =>
      m.tMs === 24_000 ? muestra(m.tMs, 40, 6) : m,
    );

    expect(conPico).toHaveLength(30);
    expect(resumirTimeLapse(framesA(60), conPico).fugaMemoria).toBe(false);
  });

  it("sin renderer no inventa cifras: n/d y criterio no cumplido", () => {
    const sinRenderer = Array.from({ length: 30 }, (_, i) =>
      muestra(i * 1000, null, null, null),
    );

    const resumen = resumirTimeLapse(framesA(60), sinRenderer);

    expect(resumen.memoria.geometrias.inicio).toBeNull();
    expect(resumen.memoria.geometrias.delta).toBeNull();
    expect(resumen.drawCallsMax).toBeNull();
    expect(resumen.fugaMemoria).toBe(false);
    expect(resumen.cumpleCriterio).toBe(false);
  });

  it("sin muestras no declara el criterio cumplido", () => {
    const resumen = resumirTimeLapse([], []);

    expect(resumen.frames).toBe(0);
    expect(resumen.fpsMedio).toBe(0);
    expect(resumen.duracionMs).toBe(0);
    expect(resumen.cumpleCriterio).toBe(false);
  });

  it("pocos puntos no hablan de fuga: no hay serie que comparar", () => {
    expect(hayFugaMemoria([muestra(0, 4, 6), muestra(1000, 40, 6)])).toBe(
      false,
    );
  });
});

describe("mediana", () => {
  it("devuelve el central, y el promedio de los dos centrales si son pares", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
  });

  it("no la mueve un extremo", () => {
    expect(mediana([4, 4, 4, 4, 900])).toBe(4);
  });
});

describe("leerMuestra — la lectura del renderer", () => {
  it("sin renderer devuelve n/d en vez de 0, que parecería una medición", () => {
    registerDrawCallsSource(null);

    expect(leerMuestra(1000)).toEqual({
      tMs: 1000,
      geometries: null,
      textures: null,
      drawCalls: null,
    });
  });

  it("lee geometrías, texturas y draw calls del renderer registrado", () => {
    registerDrawCallsSource({
      info: { render: { calls: 4 }, memory: { geometries: 4, textures: 6 } },
    });

    expect(leerMuestra(500)).toEqual({
      tMs: 500,
      geometries: 4,
      textures: 6,
      drawCalls: 4,
    });
    registerDrawCallsSource(null);
  });
});

describe("formatearTimeLapse — el informe que se pega en el doc", () => {
  it("deja una línea por métrica, con n/d donde no hay dato", () => {
    const texto = formatearTimeLapse(resumirTimeLapse(framesA(60), quieta()));

    expect(texto).toContain("fps medio 60.0");
    expect(texto).toContain("geo 4 → 4 (0)");
    expect(texto).toContain("tex 6 → 6 (0)");
    expect(texto).toContain("fuga de memoria no");
    expect(texto).toContain("criterio 1.6.2 cumple");
  });

  it("pone n/d y NO CUMPLE cuando no hay renderer", () => {
    const texto = formatearTimeLapse(
      resumirTimeLapse(
        framesA(60),
        Array.from({ length: 30 }, (_, i) =>
          muestra(i * 1000, null, null, null),
        ),
      ),
    );

    expect(texto).toContain("geo n/d → n/d");
    expect(texto).toContain("draw máx n/d");
    expect(texto).toContain("criterio 1.6.2 NO CUMPLE");
  });

  it("marca el fallo cuando los FPS no llegan, sin eufemismos", () => {
    expect(
      formatearTimeLapse(resumirTimeLapse(framesA(40), quieta())),
    ).toContain("criterio 1.6.2 NO CUMPLE");
  });
});

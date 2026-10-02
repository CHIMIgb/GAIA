/**
 * Criterio ROADMAP 0.7.1: el overlay de dev mide FPS y p95 de frame de verdad, y las
 * draw calls aparecen cuando hay renderer (n/d mientras no, que es el estado de hoy:
 * la escena base es 1.1.1). Memoria y time-lapse llegan en 1.6.2.
 *
 * Aquí la matemática y el unpintado; el rAF se Advance con relojes falsos porque 30 s de
 * reloj real no son un test.
 */
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DevOverlay } from "../../src/components/DevOverlay";
import {
  WINDOW_FRAMES,
  computeStats,
  registerDrawCallsSource,
  summarizeLongTasks,
} from "../../src/utils/frameStats";

/** `frames` de duración constante: el FPS es la inversa de la media. */
const aFrames = (ms: number, times: number): number[] =>
  Array.from({ length: times }, () => ms);

describe("computeStats", () => {
  afterEach(() => registerDrawCallsSource(null));

  it("sin muestras no inventa métricas", () => {
    expect(computeStats([])).toMatchObject({ fps: 0, p95Ms: 0, frames: 0 });
  });

  it("calcula el FPS como la inversa de la media de la ventana", () => {
    // 16.67 ms ≈ 60 FPS; la media es la duración media, no la mediana.
    const stats = computeStats(aFrames(16.67, 10));

    expect(stats.fps).toBeCloseTo(60, 0);
    expect(stats.frames).toBe(10);
  });

  it("la p95 ve una cola del 5 % que el promedio esconde", () => {
    // 95 frames rápidos y 5 de 200 ms: el promedio aún dice 51 FPS, pero el usuario
    // ya nota los tirones. Es justo lo que la p95 tiene que sacar a la luz.
    const samples = [...aFrames(10, 95), ...aFrames(200, 5)];
    const stats = computeStats(samples);

    // p95 = 200 ms (la cola), no 10 ms (lo que daría la mediana).
    expect(stats.p95Ms).toBe(200);
    expect(stats.fps).toBeLessThan(60);
  });

  it("un pico aislado no empuja la p95", () => {
    // 119 frames de 10 ms y uno de 200: el percentil 95 sigue en la zona rápida.
    const stats = computeStats([...aFrames(10, 119), 200]);

    expect(stats.p95Ms).toBe(10);
    expect(stats.fps).toBeLessThan(90);
  });

  it("con todos los frames lentos la p95 también lo ve", () => {
    // 30 frames a 33 ms: p95 = 33 ms, no el mínimo de la ventana.
    expect(computeStats(aFrames(33, 30)).p95Ms).toBe(33);
  });

  it("muestra n/d mientras no hay renderer y las llamadas cuando lo hay", () => {
    expect(computeStats(aFrames(16, 2)).drawCalls).toBeNull();

    registerDrawCallsSource({
      info: { render: { calls: 8 }, memory: { geometries: 4, textures: 6 } },
    });
    expect(computeStats(aFrames(16, 2)).drawCalls).toBe(8);
  });
});

describe("ventana de muestras", () => {
  it("es de 2 s a 60 FPS", () => {
    // 120 frames ≈ 2 s: la ventana que se muestra en el overlay.
    expect(WINDOW_FRAMES).toBe(120);
  });
});

describe("el registro sobrevive a HMR", () => {
  afterEach(() => registerDrawCallsSource(null));

  it("dos instancias del módulo leen la misma fuente", async () => {
    registerDrawCallsSource({
      info: { render: { calls: 3 }, memory: { geometries: 1, textures: 2 } },
    });
    // Es lo que hace un hot-update de Vite sobre `frameStats`: el overlay pasa a leer una
    // instancia nueva mientras el motor sigue registrado en la anterior. Sin el registro en
    // `globalThis`, el overlay se queda en `n/d` para siempre.
    vi.resetModules();
    const otra = await import("../../src/utils/frameStats");

    expect(otra.readMemory()).toEqual({ geometries: 1, textures: 2 });
    expect(otra.computeStats([16.67, 16.67]).drawCalls).toBe(3);
  });
});

describe("frames largos y LoAF (0.7.7)", () => {
  it("cuenta los frames que pasan de 18 ms, y solo esos", () => {
    // 18 ms es el p95 de `TESTING` §3.2: 18 clavado todavía entra, 18.1 se pasa. Y 33
    // es el frame perdido de manual, el que el usuario nota de verdad.
    const stats = computeStats([17, 18, 17, 33, 18.1]);

    expect(stats.longFrames).toBe(2);
  });

  it("una ventana a 60 FPS da 0 frames largos, no n/d", () => {
    // Aquí el 0 sí es una medida: se observaron todos los frames y ninguno pasó.
    expect(computeStats(aFrames(16.67, 30)).longFrames).toBe(0);
  });

  it("resume los frames largos atribuidos con el peor de la ventana", () => {
    expect(summarizeLongTasks([58, 121, 60])).toEqual({
      tasks: 3,
      worstMs: 121,
    });
  });

  it("sin frames atribuidos muestra n/d en vez de un 0 inventado", () => {
    // Igual que las draw calls: `0` parecería "se midió y valió 0 ms", que es
    // mentira, y además en Firefox/Safari es la API entera la que no existe.
    expect(summarizeLongTasks([])).toEqual({ tasks: 0, worstMs: null });
  });
});

describe("overlay: memoria y time-lapse (1.6.2)", () => {
  afterEach(() => {
    registerDrawCallsSource(null);
    vi.useRealTimers();
  });

  /** Monta el overlay y deja correr `ms` de rAF. */
  const montar = async (ms: number): Promise<ReturnType<typeof render>> => {
    vi.useFakeTimers();
    const vista = render(<DevOverlay />);
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    return vista;
  };

  it("enseña n/d de memoria mientras no hay renderer", async () => {
    const { container } = await montar(300);

    expect(container.textContent).toContain("geo    n/d");
    expect(container.textContent).toContain("tex    n/d");
  });

  it("enseña la memoria cuando el motor registra su fuente", async () => {
    registerDrawCallsSource({
      info: { render: { calls: 8 }, memory: { geometries: 4, textures: 6 } },
    });

    const { container } = await montar(300);

    expect(container.textContent).toContain("geo    4");
    expect(container.textContent).toContain("tex    6");
  });

  it("sin renderer avisa al empezar, para no esperar 30 s en balde", async () => {
    const { container } = await montar(300);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    });

    expect(container.textContent).toContain("sin renderer: saldrá n/d");
  });

  it("la duración es la del intervalo, no los minutos que lleve la página abierta", async () => {
    registerDrawCallsSource({
      info: { render: { calls: 4 }, memory: { geometries: 4, textures: 6 } },
    });
    // 30 s de vida previa: si el reloj del informe fuera el absoluto de la página, saldría
    // "duración 60 s", que es justo lo que se midió con la pestaña abierta y HMR encima.
    const { container } = await montar(30_000);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    const informe =
      container.querySelector('[data-testid="dev-overlay-informe"]')
        ?.textContent ?? "";
    const segundos = Number(informe.match(/duración ([\d.]+) s/)?.[1]);
    expect(segundos).toBeGreaterThan(29);
    expect(segundos).toBeLessThan(31);
  });

  it("con `t` mide 30 s y suelta el informe del criterio", async () => {
    registerDrawCallsSource({
      info: { render: { calls: 4 }, memory: { geometries: 4, textures: 6 } },
    });
    const { container } = await montar(300);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "t" }));
    });
    expect(container.textContent).toContain("midiendo 30 s");

    await act(async () => {
      vi.advanceTimersByTime(31_000);
    });

    const informe = container.querySelector(
      '[data-testid="dev-overlay-informe"]',
    )?.textContent;
    expect(informe).toContain("geo 4 → 4 (0)");
    expect(informe).toContain("fuga de memoria no");
    expect(informe).toContain("criterio 1.6.2 cumple");
  });
});

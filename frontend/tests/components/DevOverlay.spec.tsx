/**
 * Criterio ROADMAP 0.7.1: el overlay de dev mide FPS y p95 de frame de verdad, y las
 * draw calls aparecen cuando hay renderer (n/d mientras no, que es el estado de hoy:
 * la escena base es 1.1.1).
 *
 * Aquí solo la matemática, que es lo que tiene lógica: el rAF y el repintado se
 * comprueban en el E2E (`tests/e2e/smoke.spec.ts`).
 */
import { afterEach, describe, expect, it } from "vitest";

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

    registerDrawCallsSource({ info: { render: { calls: 8 } } });
    expect(computeStats(aFrames(16, 2)).drawCalls).toBe(8);
  });
});

describe("ventana de muestras", () => {
  it("es de 2 s a 60 FPS", () => {
    // 120 frames ≈ 2 s: la ventana que se muestra en el overlay.
    expect(WINDOW_FRAMES).toBe(120);
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

/**
 * Bucle de render y su pausa con la pestaña oculta (ROADMAP 1.9.5).
 *
 * El bucle vive en su propia clase y no dentro del `Engine` a propósito: el criterio de
 * 1.9.5 se cumple entero aquí —dejar de pedir frames con la pestaña oculta y volver a
 * pedirlos al mirarla de nuevo— y se puede comprobar en jsdom, donde `Engine` no llega
 * porque `WebGLRenderer` necesita un contexto WebGL que jsdom no tiene. Lo que el paso
 * entrega es el reloj de los frames; qué se hace en cada uno (`CameraController.update` y
 * `render`) lo sigue poniendo el motor.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { RenderLoop } from "../../src/core/RenderLoop";

/** Oculta o muestra la pestaña y avisa, que es el par real de eventos del navegador. */
const IDLE_MS = 250;

const visibility = (hidden: boolean): void => {
  vi.spyOn(document, "hidden", "get").mockReturnValue(hidden);
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RenderLoop — el bucle y su pausa (ROADMAP 1.9.5)", () => {
  it("pide un frame por cada vez que avanza el reloj, mientras la pestaña esté visible", () => {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "Date",
        "performance",
      ],
    });
    const marcas: number[] = [];
    const bucle = new RenderLoop((ahora) => marcas.push(ahora));
    bucle.start();

    // Un salto por frame, que es lo que hace el reloj falso: cuatro saltos, cuatro frames.
    for (let frame = 0; frame < 4; frame++) vi.advanceTimersToNextFrame();

    expect(marcas).toHaveLength(4);
    // El tiempo del frame va en marcha, que es lo que mide el vuelo de acercamiento.
    expect([...marcas].sort((a, b) => a - b)).toEqual(marcas);
    bucle.dispose();
  });

  it("no pide ningún frame con la pestaña oculta y sigue al volver a mirarla", () => {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "Date",
        "performance",
      ],
    });
    const marcas: number[] = [];
    const bucle = new RenderLoop((ahora) => marcas.push(ahora));
    bucle.start();
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(marcas).toHaveLength(2);

    visibility(true);
    vi.advanceTimersByTime(2000);
    expect(marcas).toHaveLength(2);

    visibility(false);
    vi.advanceTimersToNextFrame();
    expect(marcas).toHaveLength(3);
    // "Se reanuda sin desincronización": el primer frame de vuelta lleva la hora de
    // ahora, no la del frame anterior a la pausa. Un reloj guardado se delataría aquí,
    // con una cámara que da un salto de dos segundos al primer movimiento.
    expect(marcas[2]).toBeGreaterThanOrEqual(2000);
    bucle.dispose();
  });

  it("al destruirse deja de pedir frames y suelta el listener de visibilidad", () => {
    vi.useFakeTimers({
      toFake: [
        "requestAnimationFrame",
        "cancelAnimationFrame",
        "Date",
        "performance",
      ],
    });
    const marcas: number[] = [];
    const bucle = new RenderLoop((ahora) => marcas.push(ahora));
    bucle.start();
    bucle.dispose();

    vi.advanceTimersByTime(16 * 5);
    expect(marcas).toHaveLength(0);

    // Un `Engine` desmontado por React no debe seguir recibiendo eventos de la
    // visibilidad: si el listener sobrevive, el bucle resurrecta una escena ya destruida.
    visibility(false);
    vi.advanceTimersByTime(16 * 5);
    expect(marcas).toHaveLength(0);
  });
});

it("baja el ritmo cuando está inactivo y lo sube al volver la interacción", () => {
  vi.useFakeTimers({
    toFake: [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "setTimeout",
      "clearTimeout",
      "Date",
      "performance",
    ],
  });
  const marcas: number[] = [];
  const bucle = new RenderLoop((ahora) => marcas.push(ahora));
  bucle.setIdle(true);
  bucle.start();

  // En reposo se pide un frame cada 250 ms (4 FPS), no cada 16 ms: un ahorro notable
  // sin que el giro de fondo se note entrecortado y sin flicker.
  vi.runOnlyPendingTimers();
  expect(marcas).toHaveLength(1);

  vi.advanceTimersByTime(IDLE_MS);
  expect(marcas).toHaveLength(2);

  bucle.setIdle(false);
  vi.advanceTimersToNextFrame();
  expect(marcas).toHaveLength(3);

  // En activo vuelve a 60 FPS: cuatro frames en ~64 ms.
  vi.advanceTimersToNextFrame();
  vi.advanceTimersToNextFrame();
  vi.advanceTimersToNextFrame();
  expect(marcas).toHaveLength(6);

  bucle.dispose();
});

/**
 * Cámara orbital (ROADMAP 1.1.2).
 *
 * `OrbitControls` vive en el hilo principal y solo necesita DOM, que jsdom tiene, así
 * que aquí se prueba de verdad: los límites, el disparo de la auto-rotación por
 * inactividad y el corte de la inercia con `prefers-reduced-motion`. La sensación del
 * gesto no se puede probar en jsdom; eso lo comprueba `tests/fps/fps.spec.ts` en
 * navegador.
 *
 * El umbral de inactividad va literal en el test y no importado de la implementación:
 * si el día que viene VISUAL_DESIGN §10 pasa a 60 s, este test tiene que ponerse rojo y
 * obligar a que el doc cambie con él, no a que el código se lleve la cifra por delante.
 */
import { PerspectiveCamera } from "three";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { CameraController } from "../../src/core/CameraController";

/** VISUAL_DESIGN §10: "auto-rotación solo en idle > 30 s". */
const IDLE_MS = 30_000;

const nuevo = () =>
  new CameraController(
    new PerspectiveCamera(45, 1, 0.1, 100),
    document.createElement("canvas"),
  );

beforeAll(() => {
  // jsdom no implementa `matchMedia`, que sí está en cualquier navegador. Un stub que
  // nunca casa equivale a "el usuario no ha pedido movimiento reducido", que es el
  // estado por defecto de la mayoría. Los tests que necesitan el otro caso lo falsean
  // con `vi.spyOn`.
  window.matchMedia ??= ((consulta: string) =>
    ({
      matches: false,
      media: consulta,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as MediaQueryList) as typeof window.matchMedia;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("CameraController — cámara orbital (ROADMAP 1.1.2)", () => {
  it("limita el zoom para no entrar en el globo ni perderlo de vista", () => {
    const { controles } = nuevo();

    // El radio del globo es 1 (ROADMAP 1.2.1): por debajo de 1 la cámara está dentro de
    // la esfera y no ve nada, y un máximo sin techo deja el globo como un píxel suelto.
    expect(controles.minDistance).toBeGreaterThan(1);
    expect(controles.maxDistance).toBeGreaterThan(controles.minDistance);
  });

  it("no deja pasar la cámara por encima de los polos", () => {
    const { controles } = nuevo();

    // La "voltereta" del criterio es el salto de guiñada al cruzar el polo, donde el
    // ángulo polar degenera. Dejar el intervalo cerrado en [0, π] lo provoca.
    expect(controles.minPolarAngle).toBeGreaterThan(0);
    expect(controles.maxPolarAngle).toBeLessThan(Math.PI);
  });

  it("deja la cámara quieta hasta que el usuario la mueve", () => {
    // VISUAL_DESIGN §10 no pide rotación propia al cargar: con el globo girando solo,
    // un punto de incendio se escapa de debajo del cursor mientras se intenta leer.
    expect(nuevo().controles.autoRotate).toBe(false);
  });

  it("auto-rota a los 30 s de inactividad y se detiene al tocar la cámara", () => {
    vi.useFakeTimers();
    const { controles } = nuevo();

    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(controles.autoRotate).toBe(false);

    vi.advanceTimersByTime(1);
    expect(controles.autoRotate).toBe(true);
    // "a velocidad mínima" (VISUAL_DESIGN §10): el valor por defecto de OrbitControls
    // es 2.0, que se nota; esto es un giro de fondo.
    expect(controles.autoRotateSpeed).toBeLessThan(1);

    // `start` es el evento que OrbitControls emite al empezar a arrastrar: el usuario
    // manda y el giro se corta en el acto, sin esperar a que el temporizador expire.
    controles.dispatchEvent({ type: "start" });
    expect(controles.autoRotate).toBe(false);
  });

  it("vuelve a contar los 30 s tras cada interacción", () => {
    vi.useFakeTimers();
    const { controles } = nuevo();

    vi.advanceTimersByTime(IDLE_MS);
    expect(controles.autoRotate).toBe(true);

    // `start` y `end` son los dos eventos que OrbitControls emite al empezar y al soltar.
    controles.dispatchEvent({ type: "start" });
    expect(controles.autoRotate).toBe(false);

    // El contador arranca al soltar, no al agarrar: treinta segundos con el dedo en la
    // pantalla no son treinta segundos de inactividad.
    vi.advanceTimersByTime(IDLE_MS);
    controles.dispatchEvent({ type: "end" });
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(controles.autoRotate).toBe(false);

    vi.advanceTimersByTime(1);
    expect(controles.autoRotate).toBe(true);
  });

  it("con prefers-reduced-motion quita la inercia y la auto-rotación", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { controles } = nuevo();

    // VISUAL_DESIGN §10: "se inhibe inercia, auto-rotación y transiciones de panel".
    expect(controles.enableDamping).toBe(false);

    // Ni aunque el usuario no toque nada: con movimiento reducido no hay giro de fondo.
    vi.advanceTimersByTime(IDLE_MS * 10);
    expect(controles.autoRotate).toBe(false);
  });

  it("con movimiento normal deja la inercia suave del drag", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    // "El globo rota de forma fluida tras el drag con inercia suave" (VISUAL_DESIGN §10).
    expect(nuevo().controles.enableDamping).toBe(true);
  });

  it("suelta los eventos del lienzo al destruirse", () => {
    const canvas = document.createElement("canvas");
    const espia = vi.spyOn(canvas, "removeEventListener");

    new CameraController(new PerspectiveCamera(), canvas).dispose();

    // Sin esto, la vista desmontada por React seguiría respondiendo al ratón y
    // moviendo una cámara que ya no dibuja nada.
    expect(espia).toHaveBeenCalled();
  });
});

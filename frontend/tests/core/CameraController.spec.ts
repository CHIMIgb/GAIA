/**
 * Cámara orbital (ROADMAP 1.1.2).
 *
 * `TrackballControls` vive en el hilo principal y solo necesita DOM, que jsdom tiene, así
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
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
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

  it("gira libremente sin polos: la cámara no tiene restricción polar", () => {
    const { controles } = nuevo();

    // Pedido del usuario: que el arrastre vertical no se ataque en los polos.
    // TrackballControls rota por cuaterniones (arcball) y no tiene ángulo polar que
    // clampar —nada de minPolarAngle/maxPolarAngle—, así que cruza por encima y por
    // debajo del globo sin volteretas ni bloqueo.
    expect(controles).toBeInstanceOf(TrackballControls);
    expect(controles).not.toHaveProperty("minPolarAngle");
  });

  it("el zoom máximo se queda fuera de la superficie (1.4, pedido del usuario)", () => {
    const { controles } = nuevo();

    // Pedido del usuario antes de validar 1.4.1: a 1.05 la cámara se asomaba a la cara
    // lejana del globo (el antípoda) en vez de a la superficie. 1.4 la deja holgada.
    expect(controles.minDistance).toBe(1.4);
  });

  it("el clic derecho no arrastra el planeta (sin pan)", () => {
    // Pedido del usuario: TrackballControls reserva el botón derecho para el pan; a
    // null no hay acción asignada y el clic derecho no mueve la cámara.
    expect(nuevo().controles.mouseButtons.RIGHT).toBeNull();
  });

  it("gira más rápido que el 1.0 por defecto de TrackballControls", () => {
    // Pedido del usuario: "más sensibilidad" al girar. El valor exacto es la única
    // constante de ajuste del archivo (VELOCIDAD_ROTACION = 1.8).
    expect(nuevo().controles.rotateSpeed).toBeGreaterThan(1);
  });

  it("mide el arrastre igual en horizontal y en vertical", () => {
    const { controles } = nuevo();

    // El arcball normaliza cada eje por la mitad de su dimensión, así que sin más el
    // arrastre horizontal gira a `alto/ancho` del vertical (0.56 a 1280×720). Con los
    // dos lados de la pantalla igualados, la sensibilidad es la misma en ambos ejes.
    expect(controles.screen.width).toBe(controles.screen.height);
  });

  it("remeasure el arrastre cuando cambia el tamaño de la ventana", () => {
    const ctrl = nuevo();
    const espia = vi.spyOn(ctrl.controles, "handleResize");

    window.dispatchEvent(new Event("resize"));

    // Ni TrackballControls ni OrbitControls escuchan `resize` (su `handleResize()` solo
    // corre en el constructor): sin esto, tras redimensionar la ventana el arrastre se
    // mediría contra el tamaño viejo del lienzo.
    expect(espia).toHaveBeenCalled();
  });

  it("deja la cámara quieta hasta que el usuario la mueve", () => {
    // VISUAL_DESIGN §10 no pide rotación propia al cargar: con el globo girando solo,
    // un punto de incendio se escapa de debajo del cursor mientras se intenta leer.
    expect(nuevo().giraEnFondo).toBe(false);
  });

  it("el giro de fondo orbita la cámara despacio, sin zoom", () => {
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    camara.position.set(0, 0, 3);
    const ctrl = new CameraController(camara, document.createElement("canvas"));
    const antes = camara.position.clone();

    ctrl.giraEnFondo = true;
    ctrl.update();
    const despues = camara.position.clone();

    // Orbita: cambia de sitio, pero a la misma distancia del globo.
    expect(despues.equals(antes)).toBe(false);
    expect(despues.length()).toBeCloseTo(antes.length(), 5);
    // "A velocidad mínima" (VISUAL_DESIGN §10): un frame apenas se nota (≈0,05°).
    expect(antes.angleTo(despues)).toBeLessThan(0.005);
  });

  it("gira en fondo a los 30 s de inactividad y se detiene al tocar la cámara", () => {
    vi.useFakeTimers();
    const ctrl = nuevo();

    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(ctrl.giraEnFondo).toBe(false);

    vi.advanceTimersByTime(1);
    expect(ctrl.giraEnFondo).toBe(true);

    // `start` es el evento que TrackballControls emite al empezar a arrastrar: el usuario
    // manda y el giro se corta en el acto, sin esperar a que el temporizador expire.
    ctrl.controles.dispatchEvent({ type: "start" });
    expect(ctrl.giraEnFondo).toBe(false);
  });

  it("vuelve a contar los 30 s tras cada interacción", () => {
    vi.useFakeTimers();
    const ctrl = nuevo();

    vi.advanceTimersByTime(IDLE_MS);
    expect(ctrl.giraEnFondo).toBe(true);

    // `start` y `end` son los dos eventos que TrackballControls emite al empezar y al
    // soltar.
    ctrl.controles.dispatchEvent({ type: "start" });
    expect(ctrl.giraEnFondo).toBe(false);

    // El contador arranca al soltar, no al agarrar: treinta segundos con el dedo en la
    // pantalla no son treinta segundos de inactividad.
    vi.advanceTimersByTime(IDLE_MS);
    ctrl.controles.dispatchEvent({ type: "end" });
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(ctrl.giraEnFondo).toBe(false);

    vi.advanceTimersByTime(1);
    expect(ctrl.giraEnFondo).toBe(true);
  });

  it("con prefers-reduced-motion quita la inercia y el giro de fondo", () => {
    vi.useFakeTimers();
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const ctrl = nuevo();

    // VISUAL_DESIGN §10: "se inhibe inercia, auto-rotación y transiciones de panel".
    // En TrackballControls la inercia se corta con `staticMoving = true`, no con un
    // `enableDamping` como en OrbitControls.
    expect(ctrl.controles.staticMoving).toBe(true);

    // Ni aunque el usuario no toque nada: con movimiento reducido no hay giro de fondo.
    vi.advanceTimersByTime(IDLE_MS * 10);
    expect(ctrl.giraEnFondo).toBe(false);
  });

  it("con movimiento normal deja la inercia suave del drag", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);

    // "El globo rota de forma fluida tras el drag con inercia suave" (VISUAL_DESIGN §10).
    expect(nuevo().controles.staticMoving).toBe(false);
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

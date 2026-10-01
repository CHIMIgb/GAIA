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

import {
  CameraController,
  distanciaDeEncuadre,
} from "../../src/core/CameraController";

/** VISUAL_DESIGN §10: "auto-rotación solo en idle > 30 s". */
const IDLE_MS = 30_000;

const lienzo = (altoPx = 0): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  if (altoPx)
    Object.defineProperty(canvas, "clientHeight", {
      value: altoPx,
      configurable: true,
    });
  return canvas;
};

const nuevo = () =>
  new CameraController(new PerspectiveCamera(45, 1, 0.1, 100), lienzo());

/** jsdom no da alto al lienzo, así que el controlador cae al de un monitor de 1080. */
const ALTO_SIN_LAYOUT = 1080;

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

  it("el zoom máximo se queda fuera de la superficie (1.25, pedido del usuario)", () => {
    const { controles } = nuevo();

    // Pedido del usuario antes de validar 1.4.1: a 1.05 la cámara se asomaba a la cara
    // lejana del globo (el antípoda) en vez de a la superficie, porque el plano cercano
    // (0.1) recortaba el punto justo bajo la cámara. A 1.25 quedan 0.25 de margen, y es
    // donde el atlas de vista alcanza z8.
    expect(controles.minDistance).toBe(1.25);
  });

  it("el encuadre de arranque se deduce del alto del lienzo, no de un número fijo", () => {
    const distancia = (alto: number) => {
      const c = new PerspectiveCamera(45, 1, 0.1, 100);
      new CameraController(c, lienzo(alto));
      return c.position.length();
    };

    // El pedido: el planeta se adapta a cada pantalla y siempre queda un hueco entre sus
    // bordes y los del alto del lienzo. Cuanto más alto el lienzo, algo menos distancia
    // hace falta para dejar los mismos 48 px de margen.
    expect(distancia(800)).toBeCloseTo(distanciaDeEncuadre(800), 6);
    expect(distancia(800)).toBeGreaterThan(distancia(1080));
    expect(distancia(1080)).toBeGreaterThan(distancia(1440));
    // Y en todos los casos el disco cabe entero: el mínimo geométrico es
    // 1/sin(fov/2) = 2,61, por debajo del cual el planeta tocaría los bordes.
    for (const alto of [400, 600, 800, 1080, 1440, 2160]) {
      expect(distancia(alto)).toBeGreaterThanOrEqual(
        1 / Math.sin((22.5 * Math.PI) / 180),
      );
    }
    // El hueco es real en píxeles, no una promesa: el radio del planeta en pantalla
    // coincide con la mitad del alto menos el hueco.
    const focal = 800 / (2 * Math.tan((22.5 * Math.PI) / 180));
    const radio = focal * Math.tan(Math.asin(1 / distancia(800)));
    expect(radio).toBeCloseTo(400 - 48, 1);
  });

  it("el arrastre se afina al hacer zoom y se acelera de lejos", () => {
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    const ctrl = new CameraController(camara, document.createElement("canvas"));
    const a = (d: number) => {
      camara.position.set(0, 0, d);
      ctrl.update();
      return ctrl.controles.rotateSpeed;
    };

    // El factor va con la altura sobre la superficie (d − 1) contra el encuadre de
    // partida, que sale del alto del lienzo (aquí el de 1080 por falta de layout en
    // jsdom): allí se gira como siempre, al acercarse el giro se afina y a 6 radios el
    // tope lo deja en el doble. Ni se para del todo ni se desborda.
    const arranque = distanciaDeEncuadre(ALTO_SIN_LAYOUT);
    const alturaPorDefecto = arranque - 1;
    expect(a(arranque)).toBeCloseTo(1.8, 6);
    expect(a(1.4)).toBeCloseTo((1.8 * 0.4) / alturaPorDefecto, 6);
    expect(a(6)).toBeCloseTo(1.8 * 2, 6);
  });

  it("al redimensionar recalcula el encuadre, pero no se lo pisa si el usuario ya movió", () => {
    const canvas = lienzo(800);
    const camara = new PerspectiveCamera(45, 1, 0.1, 100);
    const ctrl = new CameraController(camara, canvas);
    const alto = (px: number) =>
      Object.defineProperty(canvas, "clientHeight", {
        value: px,
        configurable: true,
      });

    expect(camara.position.length()).toBeCloseTo(distanciaDeEncuadre(800), 6);
    alto(1440);
    window.dispatchEvent(new Event("resize"));
    expect(camara.position.length()).toBeCloseTo(distanciaDeEncuadre(1440), 6);

    // El usuario hace zoom con la rueda y redimensiona: su zoom manda, pero el encuadre
    // de referencia (la sensibilidad del arrastre) sí se recalcula con el alto nuevo.
    canvas.dispatchEvent(new Event("wheel"));
    camara.position.setLength(1.5);
    ctrl.update();
    alto(600);
    window.dispatchEvent(new Event("resize"));
    expect(camara.position.length()).toBeCloseTo(1.5, 6);
    expect(ctrl.controles.rotateSpeed).toBeLessThan(1.8);
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

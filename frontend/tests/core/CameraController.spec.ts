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
import {
  Mesh,
  PerspectiveCamera,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  BANDA_ZOOM_SUAVE,
  CameraController,
  distanciaDeEncuadre,
  DURACION_ACERCADO_MS,
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

/**
 * Doble clic a coordenada (ROADMAP 1.5.1).
 *
 * El gesto completo se prueba en jsdom: `Raycaster`, geometría y `TrackballControls` solo
 * necesitan DOM y matemáticas, no WebGL, así que aquí entra de verdad el `dblclick` del
 * lienzo y sale el recorrido de la cámara. Lo único que no se puede comprobar aquí es la
 * sensación del movimiento, que es el criterio visual del paso.
 *
 * El punto esperado de cada clic se calcula en el test con la API pública de Three
 * (`Raycaster`), no con los internos de la implementación: si compartiera la fórmula, un
 * error en ella se comprobaría contra sí mismo.
 */
const ANCHO = 800;
const ALTO = 600;

/**
 * jsdom deja `getBoundingClientRect()` a cero, y sin ancho ni alto no hay píxeles que
 * convertir a coordenadas normalizadas de dispositivo: el raycast no sabría ni dónde mira.
 * Se le da el tamaño de una pantalla de escritorio.
 */
const conPantalla = (canvas: HTMLCanvasElement) => {
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: ANCHO,
      bottom: ALTO,
      width: ANCHO,
      height: ALTO,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  return canvas;
};

const CENTRO = { x: ANCHO / 2, y: ALTO / 2 };

const dobleClic = (
  canvas: HTMLCanvasElement,
  punto: { x: number; y: number },
) =>
  canvas.dispatchEvent(
    new MouseEvent("dblclick", {
      clientX: punto.x,
      clientY: punto.y,
      bubbles: true,
    }),
  );

/** Geometría del geoide: para el raycast da igual la segmentación, no hay píxeles. */
const geoide = () => new Mesh(new SphereGeometry(1, 32, 16));

/** Normalizado de pantalla (NDC) → píxeles del lienzo, el inverso del raycast. */
const pixel = (ndcX: number, ndcY: number) => ({
  x: ((ndcX + 1) / 2) * ANCHO,
  y: ((1 - ndcY) / 2) * ALTO,
});

/** El punto del globo que hay bajo un NDC, con la API de Three y no con la del código. */
const bajoElCursor = (
  camara: PerspectiveCamera,
  malla: Mesh,
  ndcX: number,
  ndcY: number,
): Vector3 => {
  const raycaster = new Raycaster();
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camara);
  return raycaster.intersectObject(malla)[0].point.clone();
};

const latitudEnGrados = (punto: Vector3) =>
  (Math.asin(punto.y / punto.length()) * 180) / Math.PI;

/** Controller con el doble clic ya enganchado, listo para recibir un `dblclick`. */
const conDobleClic = () => {
  const canvas = conPantalla(document.createElement("canvas"));
  const camara = new PerspectiveCamera(45, 1, 0.1, 100);
  const ctrl = new CameraController(camara, canvas);
  const malla = geoide();
  ctrl.apuntarConDobleClic(malla);
  camara.updateMatrixWorld();
  return { canvas, camara, ctrl, malla };
};

/** Corre el vuelo entero y devuelve a qué distancia del centro quedó la cámara. */
const hastaElFinal = (ctrl: CameraController, camara: PerspectiveCamera) => {
  const t0 = performance.now();
  ctrl.update(t0);
  ctrl.update(t0 + DURACION_ACERCADO_MS);
  return camara.position.length();
};

describe("CameraController — doble clic a coordenada (ROADMAP 1.5.1)", () => {
  it("acerca un paso y deja el punto elegido en el centro de la pantalla", () => {
    const { canvas, camara, ctrl, malla } = conDobleClic();
    camara.position.set(0, 0, 3);
    camara.updateMatrixWorld();
    const esperado = bajoElCursor(camara, malla, 0.5, 0.25);

    dobleClic(canvas, pixel(0.5, 0.25));

    // La altura sobre la superficie (3 − 1 = 2) se divide entre el paso: la cámara pasa a
    // estar a 1,6 radios, o sea a 2,6 del centro. Se divide la altura y no la distancia
    // para que el paso sea el mismo a cualquier altura.
    expect(hastaElFinal(ctrl, camara)).toBeCloseTo(2.6, 6);
    // Y el punto acaba justo delante de la cámara, que es lo que "centrarla" significa: sin
    // esto se acercaría, pero el objetivo quedaría en otro sitio de la pantalla.
    expect(
      camara.position.clone().normalize().distanceTo(esperado.normalize()),
    ).toBeLessThan(1e-9);
  });

  it("el paso es el mismo a cualquier altura y nunca pasa del zoom máximo", () => {
    const { canvas, camara, ctrl } = conDobleClic();
    const alturas = [];
    for (const distancia of [2, 1.8]) {
      camara.position.set(0, 0, distancia);
      camara.updateMatrixWorld();
      dobleClic(canvas, CENTRO);
      alturas.push(hastaElFinal(ctrl, camara));
    }

    // Altura 1 → 1/1,25 = 0,8 → distancia 1,8. Y de ahí, altura 0,8 → 0,64 → 1,64: el paso
    // no depende de a dónde estuviera la cámara.
    expect(alturas[0]).toBeCloseTo(1.8, 6);
    expect(alturas[1]).toBeCloseTo(1.64, 6);

    // Ya en el suelo, un clic más solo centra el punto, nunca atraviesa DISTANCIA_MINIMA.
    camara.position.set(0, 0, 1.25);
    camara.updateMatrixWorld();
    dobleClic(canvas, pixel(0.5, 0));
    expect(hastaElFinal(ctrl, camara)).toBeCloseTo(1.25, 6);
  });

  it("baja al zoom máximo en unos pocos clics, como un zoom por pasos", () => {
    const { canvas, camara, ctrl } = conDobleClic();

    // La cámara está en el encuadre de partida, que es el primer zoom de partida de verdad.
    let distancia = camara.position.length();
    let clics = 0;
    while (distancia > 1.25 && clics < 12) {
      dobleClic(canvas, CENTRO);
      distancia = hastaElFinal(ctrl, camara);
      clics++;
    }

    // Desde el encuadre de partida (altura 1,83) al nivel ciudad: el gesto es repetible, no
    // un salto que ya no se puede repetir. Son 9 clics con `PASO_ACERCADO` de 1,25.
    expect(distancia).toBeCloseTo(1.25, 6);
    expect(clics).toBeLessThanOrEqual(10);
  });

  it("el movimiento es gradual: a mitad de vuelo va por el camino, sin salto", () => {
    const { canvas, camara, ctrl } = conDobleClic();
    camara.position.set(0, 0, 3);
    camara.updateMatrixWorld();
    // VISUAL_DESIGN §10 y el criterio del paso: nada de "saltos" al acercar. Con los tres
    // puntos de una curva se ve: al empezar no se ha movido, a mitad está entre los dos
    // extremos, y al final ha llegado. Un salto seco estaría ya en el final al primer
    // frame, que es justo lo que el criterio prohíbe.
    ctrl.giraEnFondo = true;
    dobleClic(canvas, CENTRO);

    const t0 = performance.now();
    ctrl.update(t0);
    const inicio = camara.position.length();
    ctrl.update(t0 + DURACION_ACERCADO_MS / 2);
    const medio = camara.position.length();
    ctrl.update(t0 + DURACION_ACERCADO_MS);
    const fin = camara.position.length();

    // El primer frame es el que dice si hay salto: si la cámara ya estuviera en su sitio
    // final, el "salto brusco" del criterio estaría ahí. Se comprueba con margen y no con
    // igualdad exacta porque entre el clic y el frame pasa algo de tiempo de verdad.
    expect(inicio).toBeGreaterThan(2.9);
    expect(medio).toBeLessThan(inicio);
    expect(medio).toBeGreaterThan(fin);
    expect(fin).toBeCloseTo(2.6, 6);
    // El doble clic es interacción del usuario, así que para el giro de fondo de los 30 s
    // cuenta igual que un arrastre, desde el primer frame.
    expect(ctrl.giraEnFondo).toBe(false);
  });

  it("un arrastre o la rueda cortan el vuelo donde esté", () => {
    const { canvas, camara, ctrl } = conDobleClic();
    camara.position.set(0, 0, 3);
    camara.updateMatrixWorld();
    dobleClic(canvas, CENTRO);
    ctrl.controles.dispatchEvent({ type: "start" });
    const t0 = performance.now();
    ctrl.update(t0 + DURACION_ACERCADO_MS);
    expect(camara.position.length()).toBeCloseTo(3, 6);

    // La rueda también manda: si no, el vuelo seguiría moviendo la cámara mientras el
    // usuario hace zoom con ella.
    dobleClic(canvas, CENTRO);
    canvas.dispatchEvent(new Event("wheel"));
    ctrl.update(t0 + DURACION_ACERCADO_MS);
    expect(camara.position.length()).toBeCloseTo(3, 6);
  });

  it("un clic fuera del disco no hace nada", () => {
    const { canvas, camara, ctrl } = conDobleClic();
    camara.position.set(0, 0, 3);
    camara.updateMatrixWorld();

    // Fuera del limbo no hay globo que apuntar, ni en el fondo del espacio. El disco
    // abarca 19,5° de arco desde la cámara, o sea un 0,85 de la pantalla en NDC: las dos
    // esquinas quedan fuera.
    for (const punto of [
      { x: 2, y: 2 },
      { x: ANCHO - 2, y: 2 },
    ]) {
      dobleClic(canvas, punto);
      expect(hastaElFinal(ctrl, camara)).toBeCloseTo(3, 6);
    }
  });

  it("no apunta a los polos de Mercator, donde la proyección no está definida", () => {
    const { canvas, camara, ctrl, malla } = conDobleClic();
    // Cámara casi encima del polo norte (1,3° fuera de su eje) mirando al centro: el
    // centro de la pantalla es el polo, a unos 87° de latitud.
    camara.position.set(0.1, 3, 0.05);
    camara.lookAt(0, 0, 0);
    camara.updateMatrixWorld();
    const enElPolo = bajoElCursor(camara, malla, 0, 0);
    const templado = bajoElCursor(camara, malla, 0, -0.2);
    const antes = camara.position.length();

    // LAT_LIMITE = 85,051°: por encima el mapa Mercator se estira sin fin, así que el
    // punto geométrico es real pero el mapa no. Lo que decide el corte es el límite, no
    // los polos exactos, y cae donde debe: el templado está del otro lado y sí vale.
    expect(latitudEnGrados(enElPolo)).toBeGreaterThan(85.05112878);
    expect(latitudEnGrados(templado)).toBeLessThan(85.05112878);

    dobleClic(canvas, pixel(0, 0));
    expect(hastaElFinal(ctrl, camara)).toBeCloseTo(antes, 6);
    dobleClic(canvas, pixel(0, -0.2));
    expect(hastaElFinal(ctrl, camara)).toBeLessThan(antes);
  });

  it("con movimiento reducido va de golpe, sin vuelo", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { canvas, camara } = conDobleClic();
    camara.position.set(0, 0, 3);
    camara.updateMatrixWorld();
    dobleClic(canvas, CENTRO);

    // VISUAL_DESIGN §10: con movimiento reducido se inhiben las transiciones, así que la
    // cámara llega ya a su sitio sin animación intermedia.
    expect(camara.position.length()).toBeCloseTo(2.6, 6);
  });

  it("al destruirse suelta el doble clic del lienzo", () => {
    const { canvas, ctrl } = conDobleClic();
    const espia = vi.spyOn(canvas, "removeEventListener");

    ctrl.dispose();

    expect(espia).toHaveBeenCalledWith("dblclick", expect.any(Function));
  });
});

/**
 * Tope de zoom (ROADMAP 1.5.2).
 *
 * El suelo de 1,25 radios ya lo imponía `TrackballControls` desde 1.1.2; lo que este paso
 * añade es que **llegar** a él sea suave y que ningún camino lo atraviese. Las dos cosas se
 * comprueban sobre la rueda de verdad, que en jsdom dispara el mismo manejador que en el
 * navegador: `TrackballControls` acumula el `deltaY` y aplica un factor multiplicativo por
 * frame, así que una muesca se mide en treinta frames para que el amortiguado se desarrolle.
 */
const conZoom = (distancia: number) => {
  const canvas = document.createElement("canvas");
  const camara = new PerspectiveCamera(45, 1, 0.1, 100);
  const ctrl = new CameraController(camara, canvas);
  camara.position.set(0, 0, distancia);
  camara.updateMatrixWorld();
  return { canvas, camara, ctrl };
};

/** Una muesca de rueda hacia el planeta (`deltaY` negativo) y 30 frames de amortiguado. */
const muesca = (canvas: HTMLCanvasElement, ctrl: CameraController) => {
  canvas.dispatchEvent(new WheelEvent("wheel", { deltaY: -100 }));
  for (let f = 0; f < 30; f++) ctrl.update(1000 + f * 16);
};

/** Cuánto se acerca la cámara en una muesca, partiendo de la distancia dada. */
const avancePorMuesca = (distancia: number) => {
  const { canvas, camara, ctrl } = conZoom(distancia);
  muesca(canvas, ctrl);
  return distancia - camara.position.length();
};

describe("CameraController — tope de zoom (ROADMAP 1.5.2)", () => {
  it("la rueda no puede pasar del suelo, ni con cuarenta muescas", () => {
    const { canvas, camara, ctrl } = conZoom(2);
    const suelo = ctrl.controles.minDistance;

    for (let i = 0; i < 40; i++) muesca(canvas, ctrl);
    const distancia = camara.position.length();

    // El suelo es infranqueable: es el criterio del paso. Con el tope duro de 1.1.2 esto
    // también se cumplía, pero la cámara llegaba de golpe; ahora llega frenando.
    expect(distancia).toBeGreaterThanOrEqual(suelo - 1e-9);
    // Y el tope blando no deja el zoom lejos de su rango: se entra en la banda del último
    // tramo, que es justo donde el frenado se nota.
    expect(distancia).toBeLessThan(suelo + BANDA_ZOOM_SUAVE);
  });

  it("en el suelo la última muesca no mueve nada, y no rebota", () => {
    const { canvas, camara, ctrl } = conZoom(1.25);

    muesca(canvas, ctrl);

    // Ni lo pasa ni devuelve un rebote: VISUAL_DESIGN §10 y §13 prohíben el rebote, así que
    // en el suelo el zoom se anula en vez de rebotar.
    expect(camara.position.length()).toBeCloseTo(1.25, 9);
  });

  it("la rueda se frena al acercarse al suelo, no solo al tocarlo", () => {
    // Una muesca aleja la cámara alrededor de un 14 % de lejos y bastante menos cerca del
    // suelo: eso es el tope blando, medido con la misma muesca en las dos alturas.
    const lejos = avancePorMuesca(2);
    const cerca = avancePorMuesca(1.25 + BANDA_ZOOM_SUAVE / 2);

    expect(lejos).toBeGreaterThan(0.05);
    expect(cerca).toBeLessThan(lejos / 2);
  });

  it("el tope depende de noZoom y noPan: con los dos apagados three se salta el clamp", () => {
    const ctrl = nuevo();

    // `TrackballControls._checkDistances()` —el que corta el zoom en [minDistance,
    // maxDistance]— solo corre si noZoom **o** noPan sigue activo: se salta cuando los dos
    // están apagados. Hoy ninguno lo está (el pan se apagó con `mouseButtons.RIGHT = null`,
    // no con `noPan`), pero si alguien apagara el zoom por su cuenta el tope se iría en
    // silencio y la cámara atravesaría el globo. Esto lo deja por escrito.
    expect(ctrl.controles.noZoom).toBe(false);
    expect(ctrl.controles.noPan).toBe(false);
  });

  it("fuera de la banda la rueda va igual de rápido que antes del tope blando", () => {
    const { ctrl } = conZoom(3);
    const base = ctrl.controles.zoomSpeed;

    ctrl.update(0);

    // El freno es local al último tramo: lejos del suelo el `zoomSpeed` es el que trae la
    // librería, sin tocar, para que este paso no cambie el zoom que el usuario ya conoce.
    expect(ctrl.controles.zoomSpeed).toBe(base);
    expect(ctrl.controles.zoomSpeed).toBeGreaterThan(0);
  });
});

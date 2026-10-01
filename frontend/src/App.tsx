import { useEffect, useRef, useState } from "react";

import { Engine } from "./core/Engine";

function App() {
  // Overlay de desarrollo (ROADMAP 0.7.1). Importación dinámica detrás de
  // `import.meta.env.DEV`: en el build de producción la rama es código muerto, Vite la
  // elimina y el overlay no entra ni en el grafo ni en el bundle.
  const [DevOverlay, setDevOverlay] = useState<null | React.ComponentType>(
    null,
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    void import("./components/DevOverlay").then((m) =>
      setDevOverlay(() => m.DevOverlay),
    );
  }, []);

  return (
    <>
      {DevOverlay ? <DevOverlay /> : null}
      <Lienzo />
      {/* La expansión de las siglas (README y SPEC la fijan) va en `small`, sin el
          tracking del rótulo: el rótulo es una línea sobria, no un subtítulo. */}
      <h1 id="rotulo">
        GAIA{" "}
        <small>
          (Geospatial Atmospheric &amp; Environmental Intelligence Architecture)
        </small>
      </h1>
    </>
  );
}

/**
 * Monta el motor sobre un lienzo a pantalla completa (ROADMAP 1.1.1).
 *
 * React no controla nada de la escena: el `Engine` vive fuera del árbol y solo se le
 * entrega el lienzo. El bucle de render va a 60 FPS y el estado de la escena no pasa por
 * un `useState` (regla de `docs/GAIA_STATE.md` §4.1).
 */
function Lienzo() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const motor = new Engine(canvas);
    motor.start();
    // Textura satelital (ROADMAP 1.4.1): descarga los tres niveles Esri en segundo
    // plano; hasta que llega el nivel 0 el globo se ve con el color base.
    void motor.globo.iniciarTextura();

    // Dataset de prueba (ROADMAP 1.6.1): 100 puntos para leer de un vistazo si el mapa
    // lat/lon → 3D cae donde toca. Solo en desarrollo, con el mismo `import.meta.env.DEV` y
    // la misma importación dinámica que el overlay: en el build de producción la rama es
    // código muerto y los puntos no entran ni en el grafo ni en el bundle.
    if (import.meta.env.DEV) {
      void import("./modules/globe/MockPoints").then((m) => {
        motor.escena.add(m.crearPuntosMock());
      });
    }

    return () => motor.dispose();
  }, []);

  return <canvas ref={ref} id="lienzo" aria-label="Globo 3D" />;
}

export default App;

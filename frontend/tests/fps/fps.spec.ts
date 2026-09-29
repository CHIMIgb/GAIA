/**
 * Medición de FPS y p95 de frame en headless (ROADMAP 0.7.15).
 *
 * Complementa a `tests/fcp/`, que mide arranque: aquí la página ya está cargada y lo que
 * se mira es si el build de producción deja caer frames. Se mide sobre `vite preview` y
 * el build de producción, por el mismo motivo que el FCP: un dev server no mide nada real.
 *
 * La estadística **no se reimplementa**: se importa `computeStats` de
 * `src/utils/frameStats.ts`, el mismo que alimenta el `DevOverlay`, para que el número de
 * CI y el que ve un desarrollador en pantalla no puedan separarse por una diferencia de
 * aritmética. Si algún día divergen, el bug está en el import, no en dos fórmulas.
 *
 * **Lo que este número no es**: el presupuesto de 60 FPS y p95 ≤ 18 ms de `TESTING` §3.2
 * es de GPU real, y Chromium headless no tiene GPU. Aquí no se gatea contra ese
 * presupuesto porque sería una puerta que se pasa siempre y da una falsa confianza; lo
 * que se mide es si el scaffold pierde frames, y a partir de F1, si la escena los pierde.
 * Por eso lo único que se exige es que la medición exista: un 0 o un `n/d` aquí sería un
 * fallo silencioso, no un resultado.
 */
import { expect, test } from "@playwright/test";

import { WINDOW_FRAMES, computeStats } from "../../src/utils/frameStats";

/** Tres carreras, igual que el FCP: la mediana ignora un pico de arranque en frío. */
const EJECUCIONES = 3;

test("el build de producción emite FPS y p95 de frame medibles", async ({
  browser,
}, testInfo) => {
  const medidas: { fps: number; p95Ms: number; frames: number }[] = [];

  for (let i = 0; i < EJECUCIONES; i += 1) {
    // Contexto nuevo por carrera, como en el FCP: reutilizarlo mediría una página ya
    // caliente, que es lo contrario de lo que ve un usuario que acaba de llegar.
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    await page.goto("/");

    // Las duraciones de frame se muestrean dentro de la página con rAF; es el único sitio
    // donde existe el reloj del compositor. Se recogen `WINDOW_FRAMES` (los mismos que
    // usa el overlay) para que ambas ventanas midan el mismo intervalo.
    const muestras: number[] = await page.evaluate(async (frames) => {
      const duraciones: number[] = [];
      let anterior = 0;
      await new Promise<void>((resolver) => {
        const paso = (marca: number) => {
          if (anterior !== 0) duraciones.push(marca - anterior);
          anterior = marca;
          if (duraciones.length >= frames) resolver();
          else requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
      });
      return duraciones;
    }, WINDOW_FRAMES);

    const stats = computeStats(muestras);
    medidas.push({ fps: stats.fps, p95Ms: stats.p95Ms, frames: stats.frames });
    await contexto.close();
  }

  // Si no se recogieron frames, `computeStats` devuelve ceros y el script emitiría un
  // "0 FPS" que parece una medición. Es un fallo de la medición, no un resultado.
  for (const [i, m] of medidas.entries()) {
    expect(
      m.frames,
      `la carrera ${i + 1} no recogió ningún frame`,
    ).toBeGreaterThan(0);
  }

  const fps = medidas.map((m) => m.fps);
  const p95 = medidas.map((m) => m.p95Ms);
  testInfo.annotations.push({
    type: "fps",
    description: `${fps.map((v) => v.toFixed(1)).join(" / ")} fps, p95 ${p95
      .map((v) => v.toFixed(1))
      .join(" / ")} ms`,
  });
  console.log(
    `FPS ${fps.map((v) => v.toFixed(1)).join(" / ")} — p95 ${p95
      .map((v) => v.toFixed(1))
      .join(
        " / ",
      )} ms — ${WINDOW_FRAMES} frames por carrera (headless, sin GPU: no es el presupuesto de 60 FPS de TESTING §3.2)`,
  );
});

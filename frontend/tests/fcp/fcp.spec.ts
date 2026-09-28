/**
 * Criterio ROADMAP 0.7.4: el FCP se mide sobre el **build de producción** servido por
 * `vite preview`, con el perfil 4G que `GAIA_TESTING.md` §3.3 fija como referencia de
 * CI, y el presupuesto es < 2.0 s (`SPEC` RNF-06).
 *
 * No es el dev server a propósito: allí no hay bundle, ni minificación, ni hash de
 * contenido, y el número no sería comparable con el de una build real.
 *
 * Config aparte (`playwright.fcp.config.ts`) y directorio aparte (`tests/fcp/`) para
 * que el smoke E2E no se frague con un `webServer` de preview que no necesita.
 */
import { expect, test } from "@playwright/test";

import { FCP_MAX_MS, fcpMs, mediana, red4g } from "../../scripts/fcp.mjs";

/** Tres carreras: la mediana ignora un pico de arranque en frío sin pedir más tiempo. */
const EJECUCIONES = 3;

test("el FCP del build de producción va bajo el presupuesto con red 4G", async ({
  browser,
}, testInfo) => {
  const medidas: number[] = [];

  for (let i = 0; i < EJECUCIONES; i += 1) {
    // Contexto nuevo por carrera: reutilizarlo dejaría el bundle en el HTTP cache y
    // mediría un arranque en caliente que un usuario real no tiene.
    const contexto = await browser.newContext();
    const page = await contexto.newPage();
    const cdp = await contexto.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", red4g());

    await page.goto("/");
    // Las entradas de `paint` se entregan asíncronamente, unas frames después del
    // `load`: leerlas en el acto devolvía una lista vacía y el test fallaba sin motivo.
    // Se esperan, con un techo, para que un primer frame lento por el throttling no se
    // confunda con "no pintó nada".
    await page.waitForFunction(
      () => performance.getEntriesByName("first-contentful-paint").length > 0,
      undefined,
      { timeout: 10_000 },
    );
    const entradas = await page.evaluate(() =>
      performance
        .getEntriesByType("paint")
        .map((e) => ({ name: e.name, startTime: e.startTime })),
    );
    medidas.push(fcpMs(entradas));
    await contexto.close();
  }

  const resultado = mediana(medidas);
  // Si no hubo entrada de paint, no hay nada que comparar: es un fallo, no un 0.
  expect(
    resultado,
    "la página no registró first-contentful-paint",
  ).not.toBeNull();
  expect(resultado, `FCP ${resultado?.toFixed(0)} ms`).toBeLessThan(FCP_MAX_MS);

  testInfo.annotations.push({
    type: "fcp",
    description: medidas.map((ms) => `${ms?.toFixed(0)} ms`).join(" / "),
  });
  console.log(
    `FCP mediana ${resultado?.toFixed(0)} ms (carreras: ${medidas
      .map((ms) => `${ms?.toFixed(0)} ms`)
      .join(", ")}) — presupuesto ${FCP_MAX_MS} ms`,
  );
});

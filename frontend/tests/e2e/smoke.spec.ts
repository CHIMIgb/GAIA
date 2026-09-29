/**
 * Primer flujo E2E (ROADMAP 0.6.9): cargar la app, health y un dato mock.
 *
 * El dato mock no lo consume la UI porque el HUD y el globo son de F1/F7: lo consume
 * el write path real del store (`runDataRequest` + `fetchAPI`, `docs/GAIA_STATE.md` §6.4),
 * que es donde un datum entra en la app. Importarlo en la página lo ejercita en el
 * navegador real, no en jsdom como los unitarios.
 */
import { expect, test } from "@playwright/test";

import { BACKEND_ORIGIN } from "../../playwright.config";

interface MockDato {
  success: true;
  data: {
    type: string;
    generated_at: string;
    features: {
      type: string;
      geometry: { type: string; coordinates: [number, number] };
      properties: {
        latitude: number;
        longitude: number;
        frp: number;
        confidence: string;
      };
    }[];
  };
  error: null;
}

test("la app carga y monta sin errores de consola", async ({ page }) => {
  const errores: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errores.push(msg.text());
  });
  page.on("pageerror", (err) => errores.push(String(err)));

  await page.goto("/");

  await expect(page.locator("#root")).toBeVisible();
  await expect(page.locator("#root h1")).toBeVisible();
  expect(errores).toEqual([]);
});

test("health responde con el sobre del contrato", async ({ request }) => {
  const res = await request.get(`${BACKEND_ORIGIN}/api/health`);

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(body.error).toBeNull();
  expect(body.data.status).toBe("ok");
});

test("el overlay de dev muestra FPS y se oculta con la tecla d", async ({
  page,
}) => {
  await page.goto("/");

  const overlay = page.getByTestId("dev-overlay");
  await expect(overlay).toBeVisible();

  // Números en vivo: tras un refresco (250 ms) ya hay muestras de frame.
  await expect(overlay).toContainText("fps");
  await expect(overlay).toContainText("p95");
  // Desde 1.1.1 hay renderer, así que los draw calls son los de verdad: el cubo de
  // referencia es un draw call. Antes eran `n/d` porque el motor no existía todavía.
  await expect(overlay).toContainText("draw 1");
  await expect(overlay).not.toContainText("draw n/d");

  // El FPS es real: en un navegador con rAF activo sale de 0 y es plausible.
  const fps = await overlay.locator("xpath=.").innerText();
  const valor = Number(fps.match(/fps\s+([\d.]+)/)?.[1]);
  expect(valor).toBeGreaterThan(0);
  expect(valor).toBeLessThan(500);

  await page.keyboard.press("d");
  await expect(overlay).toBeHidden();

  await page.keyboard.press("d");
  await expect(overlay).toBeVisible();
});

test("el lienzo se dimensiona al tamaño de la ventana", async ({ page }) => {
  await page.goto("/");

  const lienzo = page.locator("#lienzo");
  const dpr = await page.evaluate(() => Math.min(window.devicePixelRatio, 2));
  const buffer = await lienzo.evaluate((c: HTMLCanvasElement) => ({
    ancho: c.width,
    alto: c.height,
    cssAncho: c.clientWidth,
    cssAlto: c.clientHeight,
  }));

  // Sin esta comprobación, un `setSize()` que no llega a ejecutarse deja el lienzo en
  // su 300x150 por defecto —45 000 píxeles en vez de un millón— y todo lo demás sigue
  // pareciendo verde: el FPS sale holgado y el cubo se ve igual, solo que más pequeño.
  // Pasó en 1.1.1 y dio un falso "60 FPS" en la validación de ese paso.
  expect(buffer.cssAncho).toBeGreaterThan(300);
  expect(buffer.cssAncho).toBe(buffer.ancho / dpr);

  // Y al cambiar el tamaño de la ventana (Resizer, PROJECT_STRUCTURE §5.1).
  await page.setViewportSize({ width: 700, height: 1000 });
  await expect
    .poll(() => lienzo.evaluate((c: HTMLCanvasElement) => c.clientWidth))
    .toBe(700);
  await expect
    .poll(() => lienzo.evaluate((c: HTMLCanvasElement) => c.width))
    .toBe(Math.round(700 * dpr));
});

test("el overlay detecta el frame largo al bloquear el main thread", async ({
  page,
}) => {
  await page.goto("/");

  const overlay = page.getByTestId("dev-overlay");
  await expect(overlay).toBeVisible();

  // Bloqueo deliberado de ~180 ms. Tiene que pasar del techo de 50 ms de LoAF: por debajo
  // de ese umbral el navegador no emite entrada y no hay nada que atribuir.
  await page.evaluate(() => {
    const fin = performance.now() + 180;
    while (performance.now() < fin) {
      /* bloquear a propósito */
    }
  });

  // Las dos detecciones de 0.7.7: el frame que se pasó de presupuesto y el frame largo
  // que el navegador atribuyó. `toContainText` reintenta solo, así que cubre el refresco
  // de 250 ms sin meter esperas a mano.
  await expect(overlay).toContainText(/lframe [1-9]/);
  await expect(overlay).toContainText(/loaf   [1-9]/);
  await expect(overlay).not.toContainText("loaf   0");

  // La duración es el dato que sirve para buscar el culpable: tiene que ser del orden del
  // bloqueo, no un resto.
  const peor = await overlay.locator("xpath=.").innerText();
  const duracion = Number(peor.match(/loaf\s+[1-9]\d*\s+peor ([\d.]+)/)?.[1]);
  expect(duracion).toBeGreaterThan(50);
  expect(duracion).toBeLessThan(400);
});

test("un dato mock deja el módulo en live", async ({ page }) => {
  // Sobre del contrato con un solo hotspot (`docs/GAIA_API_CONTRACT.md` §2).
  const mockDato: MockDato = {
    success: true,
    data: {
      type: "FeatureCollection",
      generated_at: "2026-09-27T12:00:00Z",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-121.49, 38.58] },
          properties: {
            latitude: 38.58,
            longitude: -121.49,
            frp: 12.4,
            confidence: "nominal",
          },
        },
      ],
    },
    error: null,
  };

  await page.route("**/api/fires*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockDato),
    }),
  );

  await page.goto("/");

  // Los módulos se importan en el navegador con la ruta que sirve Vite, no con la
  // relativa del repo: dentro de `page.evaluate` no hay bundler que resuelva
  // "../../src/...". El `as typeof import(...)` solo reconstruye los tipos para el
  // typecheck; en runtime manda la ruta del dev server.
  const resultado = await page.evaluate(async () => {
    const served = (path: string) => path;
    const { fetchAPI } = (await import(
      served("/src/services/api.ts")
    )) as typeof import("../../src/services/api");
    const { runDataRequest } = (await import(
      served("/src/store/actions.ts")
    )) as typeof import("../../src/store/actions");
    const { state } = (await import(
      served("/src/store/index.ts")
    )) as typeof import("../../src/store/index");

    const data = await runDataRequest("fires", () =>
      fetchAPI<MockDato["data"]>("/api/fires"),
    );
    return {
      status: state.connectionStatus.fires,
      features: data.features.length,
      firstFrp: data.features[0]?.properties.frp ?? null,
    };
  });

  // El write path puso `live` con la hora del write y sin error (STATE §6.4).
  expect(resultado.status.state).toBe("live");
  expect(resultado.status.lastError).toBeNull();
  expect(resultado.status.lastUpdate).toBeGreaterThan(0);
  expect(resultado.features).toBe(1);
  expect(resultado.firstFrp).toBe(12.4);
});

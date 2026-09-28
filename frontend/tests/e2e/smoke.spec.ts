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
  // Sin renderer todavía (la escena base es 1.1.1), así que `n/d` y no un 0 inventado.
  await expect(overlay).toContainText("draw n/d");
  await expect(overlay).not.toContainText("draw 0");

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

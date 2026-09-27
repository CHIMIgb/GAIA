/**
 * Criterio ROADMAP 0.4.2: fallo de red → estado `error` tipado, reintento
 * configurable, test unitario.
 *
 * Valores que vienen de docs y no se eligen aquí:
 * - timeout 5000 ms (WORKFLOWS §7, "sin respuesta en > 5000 ms")
 * - 1 reintento con backoff de 200 ms (decisión del usuario; el par canónico
 *   5 s + 3 reintentos de PROJECT_STRUCTURE §5.9 es del `http_client.py` del
 *   backend, cuya cadena de resiliencia es la que ya cubre estos fallos)
 * - 429 NO se reintenta: SECURITY §4.2 manda degradar al dataset de respaldo
 * - mapeo código ↔ HTTP de los 7 códigos (API_CONTRACT §6)
 *
 * Se usa `vi.stubGlobal("fetch", ...)` como en `shared/src/module.test.ts`: es el
 * patrón que ya hay en el repo y evita meter msw (GAIA_TESTING.md §6.2 lo reserva
 * para cuando haya que interceptar de verdad).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GaiaAPIError,
  fetchAPI,
  type FetchOptions,
} from "../../src/services/api";

const ok = <T>(data: T) => ({ success: true, data, error: null });

const envelopeFail = (code: string, message: string, details?: unknown) => ({
  success: false,
  data: null,
  error: { code, message, details },
});

/** Respuesta HTTP con el sobre del contrato, como lo devuelve el backend. */
function responde(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const ningunaOpcion: FetchOptions = { retries: 0, backoffMs: 0, timeoutMs: 50 };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("éxito", () => {
  it("devuelve data y no toca el store", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(responde(ok({ items: [1, 2] })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAPI<{ items: number[] }>("/api/fires")).resolves.toEqual({
      items: [1, 2],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rechaza un sobre success:true sin data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responde(ok(null))));

    await expect(fetchAPI("/api/fires", ningunaOpcion)).rejects.toThrow(
      GaiaAPIError,
    );
  });
});

describe("errores del contrato", () => {
  it("lanza GaiaAPIError con el código y el mensaje del backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responde(envelopeFail("NOT_FOUND", "No hay datos"), 404),
        ),
    );

    const error = await fetchAPI("/api/fires", ningunaOpcion).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(GaiaAPIError);
    const api = error as GaiaAPIError;
    expect(api.code).toBe("NOT_FOUND");
    expect(api.message).toBe("No hay datos");
    expect(api.status).toBe(404);
  });

  it("un 429 expone retry_after_seconds y no se reintenta", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      responde(
        envelopeFail("UPSTREAM_RATE_LIMITED", "Too many requests", {
          retry_after_seconds: 30,
        }),
        429,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const error = (await fetchAPI("/api/fires").catch(
      (e: unknown) => e,
    )) as GaiaAPIError;

    expect(error.code).toBe("UPSTREAM_RATE_LIMITED");
    expect(error.retryAfterSeconds).toBe(30);
    // Reintentar un 429 es pelearse con el rate-limit: SECURITY §4.2 degradar.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("un body que no es sobre se mapea por el status HTTP", async () => {
    // Una página de error de proxy: HTML, no JSON del contrato.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(responde("<html>502</html>", 502)),
    );

    const error = (await fetchAPI("/api/fires", ningunaOpcion).catch(
      (e: unknown) => e,
    )) as GaiaAPIError;

    expect(error.code).toBe("UPSTREAM_UNAVAILABLE"); // API_CONTRACT §6
    expect(error.status).toBe(502);
  });

  it("un status fuera de la tabla cae en INTERNAL_SERVER_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(responde("teapot", 418)));

    const error = (await fetchAPI("/api/fires", ningunaOpcion).catch(
      (e: unknown) => e,
    )) as GaiaAPIError;

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
  });

  it("un código desconocido del backend no se cuela como si fuera válido", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          responde(envelopeFail("FIRMS_RATE_LIMITED", "quota"), 429),
        ),
    );

    const error = (await fetchAPI("/api/fires", ningunaOpcion).catch(
      (e: unknown) => e,
    )) as GaiaAPIError;

    expect(error.code).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("fallo de red y timeout", () => {
  it("un rechazo de fetch sin respuesta da UPSTREAM_UNAVAILABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const error = (await fetchAPI("/api/fires", ningunaOpcion).catch(
      (e: unknown) => e,
    )) as GaiaAPIError;

    expect(error).toBeInstanceOf(GaiaAPIError);
    expect(error.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("el timeout aborta la petición y da UPSTREAM_TIMEOUT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("abort", "AbortError")),
            );
          }),
      ),
    );

    const error = (await fetchAPI("/api/fires", {
      retries: 0,
      timeoutMs: 20,
    }).catch((e: unknown) => e)) as GaiaAPIError;

    expect(error.code).toBe("UPSTREAM_TIMEOUT");
  });
});

describe("reintentos configurables", () => {
  it("reintenta una vez por defecto y agota en UPSTREAM_UNAVAILABLE", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = fetchAPI("/api/fires", { backoffMs: 200 }).catch(
      (e: unknown) => e,
    );
    await vi.runAllTimersAsync();

    expect(((await promesa) as GaiaAPIError).code).toBe("UPSTREAM_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2); // 1 intento + 1 reintento
  });

  it("con retries:0 no reintenta", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAPI("/api/fires", ningunaOpcion)).rejects.toThrow(
      GaiaAPIError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("con retries:4 reintenta hasta cinco veces", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = fetchAPI("/api/fires", {
      retries: 4,
      backoffMs: 200,
    }).catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    await promesa;

    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("reintenta un 5xx y entrega el segundo intento", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        responde(envelopeFail("UPSTREAM_UNAVAILABLE", "caído"), 502),
      )
      .mockResolvedValueOnce(responde(ok({ items: [] })));
    vi.stubGlobal("fetch", fetchMock);

    const promesa = fetchAPI<{ items: number[] }>("/api/fires", {
      backoffMs: 200,
    });
    await vi.runAllTimersAsync();

    await expect(promesa).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("no reintenta un 4xx que no sea 429", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        responde(envelopeFail("VALIDATION_ERROR", "hours inválido"), 400),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAPI("/api/fires", { backoffMs: 200 })).rejects.toThrow(
      GaiaAPIError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("respeta un AbortSignal externo", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("abort", "AbortError")),
            );
          }),
      ),
    );

    const promesa = fetchAPI("/api/fires", {
      retries: 3,
      signal: controller.signal,
    });
    controller.abort();

    await expect(promesa).rejects.toThrow(GaiaAPIError);
  });
});

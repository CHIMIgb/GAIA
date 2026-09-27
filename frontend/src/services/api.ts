/**
 * Cliente HTTP tipado del contrato universal.
 *
 * Ruta y nombre fijados por `docs/GAIA_PROJECT_STRUCTURE.md` §5.7
 * (`frontend/src/services/api.ts` → `fetchAPI<T>`); el comportamiento del sobre,
 * por `docs/GAIA_API_CONTRACT.md` §2 y §5.3.
 *
 * El cliente no decide la degradación: solo convierte cada fallo en un
 * `GaiaAPIError` con uno de los 7 códigos del contrato. Quien llama decide si
 * eso significa `cached`, `fallback` o `error` (WORKFLOWS §7).
 */
import { ERROR_CODES, type ErrorCode } from "@gaia/shared";

/** Timeout por defecto: WORKFLOWS §7 ("sin respuesta en > 5000 ms"). */
const DEFAULT_TIMEOUT_MS = 5000;
/** Reintentos por defecto: 1, absorbedor de un fallo transitorio. */
const DEFAULT_RETRIES = 1;
/** Espera antes del primer reintento; el siguiente la duplica hasta el tope. */
const DEFAULT_BACKOFF_MS = 200;
const MAX_BACKOFF_MS = 2000;

export interface FetchOptions {
  /** Timeout en ms. 0 desactiva el timeout. */
  timeoutMs?: number;
  /** Reintentos **además** del primer intento. */
  retries?: number;
  /** Espera base del backoff; se duplica por reintento hasta `MAX_BACKOFF_MS`. */
  backoffMs?: number;
  signal?: AbortSignal;
}

const REQUEST_INIT_KEYS = new Set([
  "method",
  "headers",
  "body",
  "credentials",
  "cache",
  "mode",
  "redirect",
  "referrer",
  "integrity",
  "keepalive",
]);

/** Mapeo canónico código ↔ HTTP (`docs/GAIA_API_CONTRACT.md` §6). */
const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "VALIDATION_ERROR",
  404: "NOT_FOUND",
  429: "UPSTREAM_RATE_LIMITED",
  500: "INTERNAL_SERVER_ERROR",
  502: "UPSTREAM_UNAVAILABLE",
  503: "CACHE_MISS",
  504: "UPSTREAM_TIMEOUT",
};

const KNOWN_CODES: ReadonlySet<string> = new Set<string>(ERROR_CODES);

/** `details.retry_after_seconds` de un 429 (`docs/GAIA_SECURITY.md` §4.2). */
interface RetryAfterDetails {
  retry_after_seconds?: unknown;
}

export class GaiaAPIError extends Error {
  readonly code: ErrorCode;
  readonly status: number | null;
  readonly details: unknown;

  constructor(
    error: { code?: unknown; message?: unknown; details?: unknown },
    status: number | null = null,
  ) {
    // Un código fuera del catálogo no se propaga como si fuera bueno: se degrada a
    // INTERNAL_SERVER_ERROR, que es lo que el catálogo dice para "inesperado".
    const code = KNOWN_CODES.has(error.code as string)
      ? (error.code as ErrorCode)
      : "INTERNAL_SERVER_ERROR";
    super(typeof error.message === "string" ? error.message : code);
    this.name = "GaiaAPIError";
    this.code = code;
    this.status = status;
    this.details = error.details ?? null;
  }

  /** Segundos que el backend pide esperar antes de volver a pedir (429). */
  get retryAfterSeconds(): number | null {
    const value = (this.details as RetryAfterDetails | null)
      ?.retry_after_seconds;
    return typeof value === "number" ? value : null;
  }
}

const delay = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GaiaAPIError({ message: "Petición cancelada" }));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(id);
      reject(new GaiaAPIError({ message: "Petición cancelada" }));
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Un solo intento, con timeout propio. Lanza `GaiaAPIError` o devuelve `data`. */
async function attempt<T>(
  url: string,
  options: FetchOptions,
  init: RequestInit,
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer =
    timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    // Un AbortError es nuestro timeout salvo que el abort venga de fuera; el resto
    // de rechazos de fetch (TypeError) es la red sin respuesta.
    if (signal?.aborted) {
      throw new GaiaAPIError({ message: "Petición cancelada" });
    }
    // Sin `instanceof Error`: en jsdom `DOMException` no hereda de `Error`.
    if ((cause as { name?: unknown } | null)?.name === "AbortError") {
      throw new GaiaAPIError(
        {
          code: "UPSTREAM_TIMEOUT",
          message: `Timeout de ${timeoutMs} ms esperando ${url}`,
        },
        null,
      );
    }
    throw new GaiaAPIError(
      { code: "UPSTREAM_UNAVAILABLE", message: `Sin respuesta de ${url}` },
      null,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }

  // 2xx con sobre inválido es un fallo del servidor, no de la red.
  if (res.ok) {
    const body: unknown = await res.json().catch(() => undefined);
    const envelope = body as
      { success?: unknown; data?: T; error?: unknown } | undefined;
    if (
      envelope?.success !== true ||
      envelope.data === null ||
      envelope.data === undefined
    ) {
      throw new GaiaAPIError(
        {
          code: "INTERNAL_SERVER_ERROR",
          message: `Sobre de contrato inválido en ${url}`,
          details: body,
        },
        res.status,
      );
    }
    return envelope.data;
  }

  // El backend es la autoridad del sobre; si no es JSON (p. ej. una página de
  // error de proxy) se deriva el código del status según el catálogo.
  const body: unknown = await res.json().catch(() => undefined);
  const failure = body as {
    error?: { code?: unknown; message?: unknown; details?: unknown };
  };
  const error =
    failure?.error && typeof failure.error === "object"
      ? (failure.error as {
          code?: unknown;
          message?: unknown;
          details?: unknown;
        })
      : {
          code: CODE_BY_STATUS[res.status] ?? "INTERNAL_SERVER_ERROR",
          message: `HTTP ${res.status} en ${url}`,
        };
  throw new GaiaAPIError(error, res.status);
}

/** Sólo se reintenta lo transitorio: red caída y 5xx. Un 429 degrada (SECURITY §4.2). */
function esReintentable(error: GaiaAPIError): boolean {
  if (error.status === null) {
    // UPSTREAM_TIMEOUT y UPSTREAM_UNAVAILABLE: no hubo respuesta o llegó tarde.
    return (
      error.code === "UPSTREAM_TIMEOUT" || error.code === "UPSTREAM_UNAVAILABLE"
    );
  }
  return error.status >= 500 && error.status !== 504;
}

export async function fetchAPI<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const {
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    signal,
  } = options;

  const init: RequestInit = { credentials: "include" };
  for (const key of Object.keys(options)) {
    if (
      REQUEST_INIT_KEYS.has(key) &&
      (options as Record<string, unknown>)[key] !== undefined
    ) {
      (init as Record<string, unknown>)[key] = (
        options as Record<string, unknown>
      )[key];
    }
  }

  const intentos = Math.max(0, retries) + 1;
  for (let i = 0; i < intentos; i++) {
    try {
      return await attempt<T>(url, options, init);
    } catch (error) {
      const ultimo = i === intentos - 1;
      if (
        ultimo ||
        !(error instanceof GaiaAPIError) ||
        !esReintentable(error)
      ) {
        throw error;
      }
      await delay(Math.min(backoffMs * 2 ** i, MAX_BACKOFF_MS), signal);
    }
  }
  // El bucle siempre devuelve o lanza; esto solo satisface al typechecker.
  throw new GaiaAPIError({ message: `Petición sin resultado: ${url}` });
}

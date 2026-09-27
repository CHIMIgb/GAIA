/**
 * Códigos de error del contrato API de GAIA.
 * Fuente de verdad: docs/GAIA_API_CONTRACT.md §6 (catálogo de 7 códigos).
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "CACHE_MISS",
  "INTERNAL_SERVER_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const CODES: ReadonlySet<string> = new Set<string>(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && CODES.has(value);
}

export function asErrorCode(value: string): ErrorCode {
  if (!isErrorCode(value)) {
    throw new Error(`Código de error desconocido: ${value}`);
  }
  return value;
}

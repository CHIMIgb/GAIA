/**
 * Sobre del contrato universal entre backend y frontend.
 * Fuente de verdad: docs/GAIA_API_CONTRACT.md §2 y §5.3.
 */

export interface APIError {
  code: string;
  message: string;
  details?: unknown;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: APIError | null;
}

/**
 * Utilidades de fecha RFC3339 (contrato API de GAIA).
 * El contrato serializa siempre en UTC con sufijo `Z`.
 */

export function parseRFC3339(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Fecha RFC3339 inválida: ${value}`);
  }
  return d;
}

export function toRFC3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function roundtrip(value: string): string {
  return toRFC3339(parseRFC3339(value));
}

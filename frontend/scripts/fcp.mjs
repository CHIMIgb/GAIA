/**
 * Medición del FCP base del scaffold (ROADMAP 0.7.4, `SPEC` RNF-06).
 *
 * Solo lógica pura aquí: los valores y su conversión. La medición en sí navegador la
 * hace el spec de Playwright (`tests/fcp/fcp.spec.ts`), que importa estas funciones.
 *
 * Los valores canónicos no se inventan: el objetivo sale de `SPEC` RNF-06 y
 * `GAIA_TESTING.md` §3.2, y el perfil de red de `GAIA_TESTING.md` §3.3, que es el que
 * dice "referencia de CI".
 */

/** FCP objetivo: < 2.0 s (`SPEC` RNF-06, `GAIA_TESTING.md` §3.2). */
export const FCP_MAX_MS = 2000;

/**
 * Perfil 4G de `GAIA_TESTING.md` §3.3: RTT 40 ms, 9 Mbps de bajada, 1 Mbps de subida.
 * Nota: el `Slow 4G` que trae Lighthouse por defecto es 150 ms / 1.6 Mbps, que en esa
 * tabla es el perfil *3G Fast*, no el 4G. Por eso el throttling se fija a mano por CDP
 * en vez de usar el preset de Lighthouse.
 */
export const PERFIL_4G = { latencyMs: 40, downMbps: 9, upMbps: 1 };

/** Mbps son megabits (base 1000), y CDP pide bytes por segundo. */
const BYTES_POR_MBIT = 125_000;

/** Parámetros para `Network.emulateNetworkConditions` de CDP. */
export function red4g() {
  return {
    offline: false,
    latency: PERFIL_4G.latencyMs,
    downloadThroughput: PERFIL_4G.downMbps * BYTES_POR_MBIT,
    uploadThroughput: PERFIL_4G.upMbps * BYTES_POR_MBIT,
  };
}

/**
 * FCP en ms desde las entradas de tipo `paint` de la página, o `null` si no pintó
 * nada. Un `0` inventado haría pasar el presupuesto sin haber medido, así que la
 * ausencia se propaga como ausencia.
 */
export function fcpMs(entradas) {
  const pinta = entradas.find((e) => e.name === "first-contentful-paint");
  return pinta && pinta.startTime > 0 ? pinta.startTime : null;
}

/**
 * Mediana de las ejecuciones. Una sola medida es ruido: la mediana de varias es lo que
 * se registra como baseline, y un valor alto en una carrera no Falsea el dato.
 */
export function mediana(valores) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 1
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

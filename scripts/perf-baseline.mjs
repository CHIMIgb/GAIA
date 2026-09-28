/**
 * Baseline de rendimiento (ROADMAP 0.7.12).
 *
 * `docs/performance/baseline.json` guarda la última medición buena de cada métrica y
 * el historial de cómo se llegó a ella; este script mide lo de hoy y falla si algo
 * empeora más de la tolerancia. El presupuesto (`perf:check`) dice si nos pasamos;
 * esto dice si hemos empeorado, que es otra pregunta.
 *
 * Sin dependencias: la medición la hace `frontend/scripts/bundle-budget.mjs`, que ya
 * sabe leer `dist/`; aquí solo se compara.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { medir } from "../frontend/scripts/bundle-budget.mjs";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const FICHERO = join(RAIZ, "docs/performance/baseline.json");
const KB = 1024;

/**
 * Margen por el que se puede empeorar sin que caiga el job.
 *
 * No es 0 a propósito: el tamaño gzip se mueve con cualquier cambio de versión de
 * esbuild, de vite o de una dependencia transitiva, sin que el bundle cambie. Con 0 el
 * gate no distinguiría "ha entrado Three.js" de "ha subido esbuild a 8.3.2", que es
 * justo lo que tiene que distinguir. Un 1 % es ruido para arriba y yetoria para un
 * chunk que crece de verdad.
 */
export const TOLERANCIA_PCT = 1;

/** El baseline entero. `{ metricas, historial }`, o `null` si el fichero no existe. */
export function leerBaseline(fichero = FICHERO) {
  if (!existsSync(fichero)) return null;
  return JSON.parse(readFileSync(fichero, "utf8"));
}

/** La medición de referencia: la última del historial. */
export function ultima(historial) {
  return historial[historial.length - 1] ?? null;
}

/**
 * Compara lo de hoy contra lo de referencia, métrica a métrica.
 *
 * Solo mira las métricas que hay en las dos: una métrica que el baseline todavía no
 * tiene (el FCP, que necesita navegador) o una que este script no mide no es un fallo,
 * es un dato que no se está comparando. Quien lo lea tiene que poder distinguir una
 * cosa de la otra, y por eso devuelve la lista entera y no solo los fallos.
 */
export function compara(medicion, base, toleranciaPct = TOLERANCIA_PCT) {
  if (!base) return [];
  const salida = [];
  for (const [metrica, ahora] of Object.entries(medicion)) {
    const antes = base[metrica];
    if (typeof antes !== "number" || typeof ahora !== "number") continue;
    const deltaPct =
      antes === 0 ? (ahora === 0 ? 0 : 100) : ((ahora - antes) / antes) * 100;
    salida.push({
      metrica,
      antes,
      ahora,
      deltaPct: Math.round(deltaPct * 10) / 10,
      incumple: ahora > antes * (1 + toleranciaPct / 100),
    });
  }
  return salida;
}

/**
 * Medición de hoy.
 *
 * A 0,01 KiB (unos 10 bytes) y no a 0,1: el CSS pesa 1,44 KiB, así que redondeando a
 * 0,1 el gate veía un -4,8 % el primer día sin que hubiera cambiado nada. A 0,1 la
 * granularidad es la quinta parte de la métrica más pequeña que hay.
 */
export function medirAhora() {
  const m = medir();
  const kib = (bytes) => Math.round((bytes / KB) * 100) / 100;
  return {
    bundle_js_inicial_kib: kib(m.jsInicial),
    bundle_chunk_arranque_kib: kib(m.arranque),
    ...(m.css === null ? {} : { bundle_css_kib: kib(m.css) }),
  };
}

const fmt = (n) => `${n}`;

function main() {
  const baseline = leerBaseline();
  if (!baseline) {
    console.log(`Sin baseline en ${FICHERO}: nada que comparar.`);
    return;
  }
  const referencia = ultima(baseline.historial);
  if (!referencia) {
    console.log("El baseline no tiene historial: nada que comparar.");
    return;
  }

  // Contra `metricas` (la última buena de cada métrica) y no contra la última entrada
  // del historial: las mediciones no salen todas el mismo día, y comparar el bundle de
  // hoy contra una entrada que solo tiene el FCP no compara nada en silencio.
  const comparacion = compara(medirAhora(), baseline.metricas);
  const fallos = comparacion.filter((c) => c.incumple);

  console.log(
    `Comparativa contra docs/performance/baseline.json (última medición: ${referencia.fecha}, ${referencia.origen}):`,
  );
  for (const c of comparacion) {
    const signo = c.deltaPct > 0 ? "+" : "";
    console.log(
      `  ${c.metrica.padEnd(28)} ${fmt(c.antes)} → ${fmt(c.ahora)}  ${signo}${c.deltaPct} %`,
    );
  }
  const sinComparar = Object.keys(baseline.metricas).filter(
    (m) => !comparacion.some((c) => c.metrica === m),
  );
  for (const m of sinComparar) {
    console.log(
      `  ${m.padEnd(28)} ${baseline.metricas[m]} → n/d (este script no lo mide)`,
    );
  }

  if (fallos.length) {
    console.error(
      `\nBundle empeorado sobre el baseline (tolerancia ${TOLERANCIA_PCT} %):\n  - ` +
        fallos
          .map((c) => `${c.metrica} ${c.antes} → ${c.ahora} (+${c.deltaPct} %)`)
          .join("\n  - "),
    );
    process.exitCode = 1;
  } else {
    console.log(`\nBaseline OK (tolerancia ${TOLERANCIA_PCT} %).`);
  }
}

// `import.meta.main` no existe hasta Node 24; este es el equivalente sin adornos.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();

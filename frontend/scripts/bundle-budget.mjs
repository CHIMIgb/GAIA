/**
 * Presupuesto de bundle (ROADMAP 0.4.4).
 *
 * Mide el gzip de lo que hay en `dist/` y falla si se pasa de los límites que
 * fija `docs/GAIA_DEPLOYMENT.md` §5.1 (que a su vez cita RNF-01). Los límites
 * viven aquí y no en el doc para que el código sea la fuente en runtime; el doc
 * es el que dice de dónde salen.
 *
 * Sin dependencias: `node:zlib` y `node:fs` hacen todo el trabajo.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/**
 * Resuelto en llamada, no al importar: bajo vitest+jsdom `import.meta.url` no
 * es un URL de fichero y reventaría al cargar el módulo.
 */
const distPorDefecto = () =>
  fileURLToPath(new URL("../dist/", import.meta.url));

/** KB gzip. Límites de DEPLOYMENT §5.1 / RNF-01. */
export const LIMITES = { jsInicial: 450, arranque: 180, three: 250 };

const KB = 1024;
const gulp = (bytes) => (bytes / KB).toFixed(1).padStart(7, " ");

/** Tamaño gzip de un fichero, o `null` si no existe. */
export function gzipDe(ruta) {
  if (!existsSync(ruta)) return null;
  return gzipSync(readFileSync(ruta), { level: 9 }).byteLength;
}

/**
 * El chunk de arranque es el `<script type="module">` que Vite inyecta en
 * `index.html`; leerlo de ahí evita hardcodear el hash del nombre.
 */
export function chunkDeArranque(dist = distPorDefecto()) {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const src = /<script[^>]+src="([^"]+\.js)"/.exec(html)?.[1];
  return src ? join(dist, src.replace(/^\//, "")) : null;
}

export function medir(dist = distPorDefecto()) {
  const assets = join(dist, "assets");
  if (!existsSync(assets))
    throw new Error(`No existe ${assets}: ejecuta \`npm run build\` antes.`);
  const js = readdirSync(assets).filter((f) => f.endsWith(".js"));
  const css = readdirSync(assets).filter((f) => f.endsWith(".css"));
  const arranque = chunkDeArranque(dist);
  const salida = {
    jsInicial: 0,
    arranque: 0,
    three: null,
    css: null,
    ficheros: {},
  };
  for (const f of js) {
    const bytes = gzipDe(join(assets, f));
    salida.ficheros[f] = bytes;
    salida.jsInicial += bytes;
    if (arranque && join(assets, f) === arranque) salida.arranque = bytes;
    // El chunk de Three.js no existe hasta que se instale `three` (F1); se
    // detecta por nombre para no tener que mantener una lista de chunks aquí.
    if (/three/i.test(f)) salida.three = bytes;
  }
  // El CSS no lo mide el presupuesto (ningún doc le pone límite) pero sí lo
  // compara el baseline (0.7.12), así que se mide igual. `null` si no hay CSS.
  for (const f of css) {
    const bytes = gzipDe(join(assets, f));
    salida.ficheros[f] = bytes;
    salida.css = (salida.css ?? 0) + bytes;
  }
  return salida;
}

/** Incumplimientos del presupuesto, en texto legible. Vacío = todo bien. */
export function incumplimientos(m) {
  const fallos = [];
  if (m.jsInicial > LIMITES.jsInicial * KB)
    fallos.push(`JS inicial ${kb(m.jsInicial)} KB > ${LIMITES.jsInicial} KB`);
  if (m.arranque > LIMITES.arranque * KB)
    fallos.push(
      `chunk de arranque ${kb(m.arranque)} KB > ${LIMITES.arranque} KB`,
    );
  if (m.three !== null && m.three > LIMITES.three * KB)
    fallos.push(`chunk three ${kb(m.three)} KB > ${LIMITES.three} KB`);
  return fallos;
}

const kb = (bytes) => (bytes / KB).toFixed(1);
const linea = (etiqueta, valor) => `  ${etiqueta.padEnd(14)}${valor}`;

function main() {
  const m = medir();
  console.log("Bundle (gzip, KB) — límites de DEPLOYMENT §5.1");
  console.log(
    linea("JS inicial", `${gulp(m.jsInicial)} / ${LIMITES.jsInicial} KB`),
  );
  console.log(
    linea("chunk arranque", `${gulp(m.arranque)} / ${LIMITES.arranque} KB`),
  );
  console.log(
    m.three === null
      ? linea("chunk three", "n/d (three no está en el grafo; se medirá en F1)")
      : linea("chunk three", `${gulp(m.three)} / ${LIMITES.three} KB`),
  );
  console.log(
    m.css === null
      ? linea("css", "n/d (no hay css en el build)")
      : linea(
          "css",
          `${gulp(m.css)} KB (sin limite; se compara con el baseline)`,
        ),
  );
  for (const [f, bytes] of Object.entries(m.ficheros).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`     ${f}  ${gulp(bytes)} KB`);
  }

  const fallos = incumplimientos(m);
  if (fallos.length) {
    console.error(
      `\nPresupuesto de bundle superado:\n  - ${fallos.join("\n  - ")}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nPresupuesto OK.");
  }
}

// `import.meta.main` no existe hasta Node 24; este es el equivalente sin adornos.
if (process.argv[1] && process.argv[1].endsWith("bundle-budget.mjs")) main();

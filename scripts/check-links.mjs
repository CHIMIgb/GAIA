#!/usr/bin/env node
/**
 * Enlaces cruzados de los docs (ROADMAP 0.8.14, criterio "sin enlaces rotos").
 *
 * Comprueba que cada enlace interno apunte a un fichero que existe y a un ancla
 * que existe. Solo enlaces internos: los externos no se piden por red, porque un
 * check que necesita internet mide la disponibilidad de otro sitio, no la de
 * este repo.
 *
 * El slug se calcula con el mismo criterio que `github-slugger`: minúsculas, se
 * quitan los signos de puntuación y **cada** espacio se convierte en un guion sin
 * colapsar los seguidos. Por eso un título con em dash produce dos guiones
 * seguidos (`#3-fase-0--fundación...`) y un slug que colapse espacios daría por
 * roto un enlace que funciona.
 *
 * Se ignoran los bloques de código: un ejemplo de markdown dentro de un fence no
 * es un enlace del documento.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** docs/ entero + README.md y AGENTS.md, que también enlazan a los docs. */
function ficherosMd(dir) {
  const fuera = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) fuera.push(...ficherosMd(ruta));
    else if (extname(e) === ".md") fuera.push(ruta);
  }
  return fuera;
}
const FICHEROS = [
  ...ficherosMd(join(RAIZ, "docs")),
  join(RAIZ, "README.md"),
  join(RAIZ, "AGENTS.md"),
];

const slugCache = new Map();
function slug(titulo) {
  return titulo
    .replace(/`([^`]*)`/g, "$1") // el código inline no lleva marcas
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // el texto del enlace va entero
    .replace(/\*\*([^*]*)\*\*/g, "$1")
    .replace(/[*_]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/ /g, "-"); // cada espacio -> un guion, sin colapsar
}

/** Anclas de un fichero: encabezados de fuera de bloques de código + <a id="..">. */
function anclas(ruta) {
  if (slugCache.has(ruta)) return slugCache.get(ruta);
  let dentro = false;
  const out = new Set();
  for (const linea of readFileSync(ruta, "utf8").split("\n")) {
    if (/^\s*(```|~~~)/.test(linea)) dentro = !dentro;
    if (dentro) continue;
    const h = linea.match(/^(#{1,6})\s+(.*)$/);
    if (h) out.add(slug(h[2]));
    for (const a of linea.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) out.add(a[1].toLowerCase());
  }
  slugCache.set(ruta, out);
  return out;
}

let revisados = 0;
const rotos = [];

for (const f of FICHEROS) {
  let dentro = false;
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((linea, i) => {
      if (/^\s*(```|~~~)/.test(linea)) dentro = !dentro;
      if (dentro) return;
      // `(?<!!)` deja fuera las imágenes: enlaces a assets, no a docs.
      for (const m of linea.matchAll(/(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const dest = m[2];
        if (/^(https?:|mailto:|tel:|data:)/.test(dest)) continue;
        revisados++;
        // split da [ruta, ancla]: con dos elementos. Un hueco de mas aqui dejaba
        // `ancla` siempre undefined y la comprobacion de anclas no se ejecutaba nunca.
        const [ruta, ancla] = dest.split("#");
        const objetivo = ruta ? resolve(dirname(f), ruta) : f;
        const donde = `${f.slice(RAIZ.length + 1)}:${i + 1}`;
        if (ruta && !existsSync(objetivo)) rotos.push(`${donde} → ${dest} (no existe el fichero)`);
        else if (ancla && !anclas(objetivo).has(ancla))
          rotos.push(`${donde} → ${dest} (el fichero existe, el ancla no)`);
      }
    });
}

console.log(`enlaces internos revisados: ${revisados}`);
if (rotos.length) {
  console.error(`\n${rotos.length} enlace(s) roto(s):`);
  for (const r of rotos) console.error(`  ${r}`);
  process.exit(1);
}
console.log("sin enlaces rotos");

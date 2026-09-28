/**
 * El presupuesto de bundle no puede depender de `dist/`: en CI los tests corren
 * sin build previo. El test construye un dist de mentira y comprueba que se
 * mide lo que debe y que se corta cuando toca.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LIMITES,
  incumplimientos,
  medir,
} from "../../scripts/bundle-budget.mjs";

const KB = 1024;

/**
 * dist sintético con un index.html y sus chunks. Los ficheros se llenan de bytes
 * aleatorios a propósito: lo que se mide es el tamaño **gzip**, así que un
 * fichero de ceros o de letras repetidas mediría casi cero y el test no probaría
 * nada. Con datos incompresibles el gzip queda pegado al tamaño real.
 */
function distFalso({ arranque = 100, three = 0, otros = 0 } = {}) {
  const dist = mkdtempSync(join(tmpdir(), "gaia-bundle-"));
  const assets = join(dist, "assets");
  mkdirSync(assets);
  const escribir = (nombre, kib) =>
    writeFileSync(join(assets, nombre), randomBytes(kib * KB));
  const entrada = "index-abc123.js";
  escribir(entrada, arranque);
  if (three) escribir("three-def456.js", three);
  for (let i = 0; i < otros; i += 1) escribir(`chunk-${i}-ghi789.js`, 1);
  writeFileSync(
    join(dist, "index.html"),
    `<script type="module" src="/assets/${entrada}"></script>`,
  );
  return dist;
}

describe("medir el bundle", () => {
  it("el JS inicial es la suma gzip de todos los chunks", () => {
    const m = medir(distFalso({ arranque: 100, otros: 2 }));

    expect(m.jsInicial).toBe(
      m.arranque +
        m.ficheros["chunk-0-ghi789.js"] +
        m.ficheros["chunk-1-ghi789.js"],
    );
  });

  it("el chunk de arranque es el script del index.html, no el primero que encuentre", () => {
    const m = medir(distFalso({ arranque: 100, otros: 3 }));

    expect(m.arranque).toBe(m.ficheros["index-abc123.js"]);
  });

  it("sin chunk de three no hay límite que comprobar, pero tampoco error", () => {
    const m = medir(distFalso({ arranque: 100 }));

    expect(m.three).toBeNull();
    expect(incumplimientos(m)).toEqual([]);
  });
});

describe("el presupuesto corta", () => {
  it("falla si el JS inicial y el chunk de arranque se pasan", () => {
    // Dos chunks de 240 KB: el arranque se pasa de 180 y el total de 450.
    const m = medir(distFalso({ arranque: 240, otros: 240 }));

    expect(incumplimientos(m)).toEqual([
      expect.stringContaining("JS inicial"),
      expect.stringContaining("chunk de arranque"),
    ]);
  });

  it("falla si el chunk de three se pasa aunque el total quepa", () => {
    const m = medir(distFalso({ arranque: 10, three: LIMITES.three + 10 }));

    expect(incumplimientos(m)).toEqual([
      expect.stringContaining("chunk three"),
    ]);
  });

  it("no falla con un bundle dentro de los límites", () => {
    const m = medir(distFalso({ arranque: 20, otros: 2 }));

    expect(incumplimientos(m)).toEqual([]);
  });
});

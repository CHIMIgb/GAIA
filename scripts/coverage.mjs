#!/usr/bin/env node
// Agrega la cobertura del frontend y del backend y la publica por fase del
// ROADMAP (paso 0.7.10, criterio "cada fase publica su cobertura").
//
// El mapa fase → código es explícito y vive aquí, no se deduce: el ROADMAP dice
// qué hace cada fase y `GAIA_PROJECT_STRUCTURE.md` §2 cómo se llaman las carpetas,
// pero ningún doc los cruza. Las fases sin código salen igual, con "sin código
// aún", que es la información útil: se ve lo que falta por empezar.
//
// Los umbrales NO son números inventados:
//   - `frontend/src/utils` y `frontend/src/store/actions.ts` → 80 %, de
//     `GAIA_TESTING.md` §1 ("objetivo de cobertura: >= 80 %").
//   - `backend/app` → 60 %, del `fail_under` que fijó 0.6.10 en
//     `backend/pyproject.toml`.
// Lo demás se publica sin bloquear: una puerta sobre código que aún no existe
// se salta siempre.
//
// Uso: `node scripts/coverage.mjs`
// Lee (si existen) `frontend/coverage/coverage-summary.json` y
// `backend/coverage.json`, escribe la tabla en `$GITHUB_STEP_SUMMARY` cuando
// está en CI y por stdout si no, y sale con 1 si algún área con puerta baja.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Orden de fases según el ROADMAP. Los nombres de carpeta son los de
// `GAIA_PROJECT_STRUCTURE.md` §2 (`modules/seismic/`, `shaders/fire/`, ...), no
// los que se me ocurrirían.
const FASES = [
  {
    fase: "F0",
    nombre: "Fundación",
    areas: [
      "frontend/src/utils",
      "frontend/src/store/actions.ts",
      "frontend/src/services",
      "frontend/src/workers",
      "backend/app",
      "shared/src",
    ],
  },
  {
    fase: "F1",
    nombre: "Globo 3D",
    areas: [
      "frontend/src/core",
      "frontend/src/shaders/globe",
      "frontend/src/modules/globe",
    ],
  },
  {
    fase: "F2",
    nombre: "Incendios",
    areas: [
      "frontend/src/modules/fire",
      "frontend/src/shaders/fire",
      "backend/app/routers/fires.py",
    ],
  },
  {
    fase: "F3",
    nombre: "Sismos",
    areas: [
      "frontend/src/modules/seismic",
      "frontend/src/shaders/seismic",
      "backend/app/routers/quakes.py",
    ],
  },
  {
    fase: "F4",
    nombre: "Viento",
    areas: [
      "frontend/src/modules/wind",
      "frontend/src/shaders/wind",
      "backend/app/routers/wind.py",
    ],
  },
  {
    fase: "F5",
    nombre: "Inundación",
    areas: [
      "frontend/src/modules/flood",
      "frontend/src/shaders/flood",
      "backend/app/routers/floods.py",
    ],
  },
  {
    fase: "F6",
    nombre: "Radiación",
    areas: [
      "frontend/src/modules/radiation",
      "frontend/src/shaders/radiation",
      "backend/app/services/radiation_normalizer.py",
    ],
  },
  { fase: "F7", nombre: "HUD analítico", areas: ["frontend/src/components"] },
  {
    fase: "F8-F13",
    nombre: "Resiliencia, seguridad, optimización, CI/CD, producción y pulido",
    areas: [],
  },
];

// Los tres únicos umbrales que un doc fija. El resto, null = se publica y ya.
const UMBRALES = {
  "frontend/src/utils": 80,
  "frontend/src/store/actions.ts": 80,
  "backend/app": 60,
};

/** json-summary viene con rutas absolutas; aqui solo interesan a partir de
 * `frontend/src` o `shared/src`, que es como las nombra el mapa de fases. */
const relativaARepo = (ruta) => {
  const plano = ruta.replaceAll("\\", "/");
  const i = plano.indexOf("/frontend/src/");
  const j = plano.indexOf("/shared/src/");
  if (j >= 0 && (i < 0 || j < i)) return plano.slice(j + 1);
  if (i >= 0) return plano.slice(i + 1);
  return plano.replace(/^.*?(backend\/)/, "$1");
};

const coincide = (ruta, area) => ruta === area || ruta.startsWith(`${area}/`);

/** Umbral de un área, o null si el doc no la cerró. */
export const umbralDe = (area) => UMBRALES[area] ?? null;

/**
 * Las dos formas de reporte que hay que leer, como funciones puras para poder
 * testearlas: leer un fichero real en cada test ataría el test al sitio donde
 * se generó el reporte.
 *
 * `deJsonSummary` — OJO: el `json-summary` de vitest NO tiene la envoltura
 * `files` de istanbul, pone cada archivo en la raíz del objeto junto a una
 * clave `total`. Escribí el parser con la forma de istanbul y la tabla salía
 * entera en "sin código aún" con los reportes ahí mismo; el fallo no se veía
 * sin abrir el fichero.
 */
export function deJsonSummary(json) {
  const archivos = {};
  for (const [ruta, dato] of Object.entries(json)) {
    if (ruta === "total" || !dato?.lines?.total) continue;
    archivos[relativaARepo(ruta)] = {
      total: dato.lines.total,
      covered: dato.lines.covered,
    };
  }
  return archivos;
}

/**
 * `coverage.json` de coverage.py: `files[path].summary`. Sus rutas son relativas
 * al directorio desde el que se corrio pytest (`backend/`, porque `--cov=app`),
 * no absolutas: sin anteponer `backend/` ninguna casa con el mapa de fases y la
 * fila de F0 salia sin el backend, que estaba al 96 %.
 */
export function deCoveragePy(json) {
  const archivos = {};
  for (const [ruta, dato] of Object.entries(json.files ?? {})) {
    const st = dato.summary;
    if (st?.num_statements) {
      archivos[`backend/${ruta.replaceAll("\\", "/")}`] = {
        total: st.num_statements,
        covered: st.covered_lines,
      };
    }
  }
  return archivos;
}

/** Lee los reportes que haya. Faltar uno no es un error: cada job de CI
 * produce solo el suyo. */
function leerReportes() {
  const leer = (ruta) => {
    const p = join(RAIZ, ruta);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  };
  const front = leer("frontend/coverage/coverage-summary.json");
  const back = leer("backend/coverage.json");
  return {
    ...(front ? deJsonSummary(front) : {}),
    ...(back ? deCoveragePy(back) : {}),
  };
}

/**
 * Cada archivo va a un unico par (fase, area): el de la fase cuyo glob es mas
 * largo de los que lo cubren. Sin esta regla, `backend/app/routers/fires.py`
 * contaria dos veces, en F0 (que agrupa `backend/app`) y en F2, y la cobertura
 * de F0 se inflaria con codigo de modulos que ni estan escritos. Medido: con la
 * regla, F0 cuadraba en 70 %; sin ella, en 80 %.
 */
function areaDe(ruta) {
  let mejor = null;
  for (const { fase, areas } of FASES) {
    for (const area of areas) {
      if (coincide(ruta, area) && (!mejor || area.length > mejor.area.length)) {
        mejor = { fase, area };
      }
    }
  }
  return mejor;
}

export function filasDe(reporte) {
  const archivos = "files" in reporte ? reporte.files : reporte;
  return FASES.map(({ fase, nombre, areas }) => {
    const detalle = areas.map((area) => {
      const dentro = Object.entries(archivos).filter(
        ([ruta]) => areaDe(ruta)?.area === area && areaDe(ruta).fase === fase,
      );
      const total = dentro.reduce((n, [, d]) => n + d.total, 0);
      const covered = dentro.reduce((n, [, d]) => n + d.covered, 0);
      return {
        area,
        total,
        covered,
        lineas: total ? Math.round((100 * covered) / total) : null,
      };
    });
    const conCodigo = detalle.filter((a) => a.lineas !== null);
    const total = conCodigo.reduce((n, a) => n + a.total, 0);
    const covered = conCodigo.reduce((n, a) => n + a.covered, 0);
    return {
      fase,
      nombre,
      lineas: total ? Math.round((100 * covered) / total) : null,
      areas: detalle,
    };
  });
}

export function resumen(filas) {
  const fallos = [];
  for (const f of filas) {
    for (const a of f.areas) {
      const umbral = umbralDe(a.area);
      if (umbral !== null && a.lineas !== null && a.lineas < umbral) {
        fallos.push(`${a.area} ${a.lineas} % < ${umbral} % (TESTING §1)`);
      }
    }
  }
  const cuerpo = filas.map((f) => {
    const areas = f.areas
      .filter((a) => a.lineas !== null)
      .map((a) => `${a.area} ${a.lineas} %`)
      .join(", ");
    return `| ${f.fase} | ${f.nombre} | ${f.lineas === null ? "sin código aún" : `${f.lineas} %`} | ${areas || "—"} |`;
  });
  const tabla = [
    "### Cobertura por fase (0.7.10)",
    "",
    "| Fase | Módulo | Líneas | Áreas |",
    "| --- | --- | --- | --- |",
    ...cuerpo,
  ].join("\n");
  return { tabla, fallos };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const archivos = leerReportes();
  const { tabla, fallos } = resumen(filasDe(archivos));
  const destino = process.env.GITHUB_STEP_SUMMARY;
  if (destino) {
    // En CI el log se pierde al terminar el job: el step summary es lo que se
    // lee después.
    const { appendFileSync } = await import("node:fs");
    appendFileSync(destino, `${tabla}\n\n`);
  }
  console.log(tabla);
  if (!Object.keys(archivos).length) {
    console.log(
      "\nSin reportes: ejecuta `npm run coverage` (frontend) y pytest (backend).",
    );
  }
  for (const f of fallos)
    console.error(`\nCobertura por debajo del umbral: ${f}`);
  process.exit(fallos.length ? 1 : 0);
}

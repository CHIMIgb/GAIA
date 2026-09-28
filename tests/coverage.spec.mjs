import { describe, expect, it } from "vitest";

import {
  deCoveragePy,
  deJsonSummary,
  filasDe,
  resumen,
  umbralDe,
} from "../scripts/coverage.mjs";

// Cada archivo con 100 lineas, para que el agregado sea la media simple y se
// pueda comprobar a mano. La agregacion real pondera por lineas, no promedia
// porcentajes: un archivo de 10 lineas no pesa lo mismo que uno de 1000.
const reporte = (archivos) =>
  Object.fromEntries(
    Object.entries(archivos).map(([ruta, pct]) => [
      ruta,
      { total: 100, covered: pct },
    ]),
  );

const base = {
  "frontend/src/utils/frameStats.ts": 82,
  "frontend/src/store/actions.ts": 85,
  "backend/app/main.py": 70,
};

describe("cobertura por fase (0.7.10)", () => {
  it("publica una fila por fase aunque no tenga codigo", () => {
    const filas = filasDe(reporte(base));
    expect(filas.map((f) => f.fase)).toEqual([
      "F0",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8-F13",
    ]);
    expect(filas[0].lineas).toBe(79);
    expect(filas[1].lineas).toBeNull();
  });

  it("cada area se atribuye a la fase que la pide", () => {
    const filas = filasDe(reporte(base));
    expect(
      filas[0].areas.filter((a) => a.lineas !== null).map((a) => a.area),
    ).toEqual([
      "frontend/src/utils",
      "frontend/src/store/actions.ts",
      "backend/app",
    ]);
  });

  it("un archivo se cuenta una sola vez, en la fase mas especifica", () => {
    // `backend/app/routers/fires.py` casa con `backend/app` (F0) y con el area
    // de F2. Sin la regla del glob mas largo, F0 se llevaria el codigo de los
    // modulos que ni estan escritos.
    const filas = filasDe(
      reporte({
        "backend/app/main.py": 70,
        "backend/app/routers/fires.py": 90,
      }),
    );
    const f0 = filas.find((f) => f.fase === "F0");
    const f2 = filas.find((f) => f.fase === "F2");
    expect(f0.areas.find((a) => a.area === "backend/app").lineas).toBe(70);
    expect(
      f2.areas.find((a) => a.area === "backend/app/routers/fires.py").lineas,
    ).toBe(90);
  });

  it("los umbrales son los del doc, no numeros inventados", () => {
    expect(umbralDe("frontend/src/utils")).toBe(80);
    expect(umbralDe("frontend/src/store/actions.ts")).toBe(80);
    expect(umbralDe("backend/app")).toBe(60);
    expect(umbralDe("shared/src")).toBeNull();
  });

  it("falla solo si un area con puerta baja de su umbral", () => {
    const bajo = reporte({ ...base, "frontend/src/utils/frameStats.ts": 79 });
    expect(resumen(filasDe(bajo)).fallos).toEqual([
      "frontend/src/utils 79 % < 80 % (TESTING §1)",
    ]);
    expect(resumen(filasDe(base)).fallos).toEqual([]);
  });

  it("las areas sin puerta se publican pero no bloquean", () => {
    const r = resumen(filasDe(reporte({ "shared/src/contract.ts": 10 })));
    expect(r.fallos).toEqual([]);
    expect(r.tabla).toContain("F0 | Fundación | 10 %");
    expect(r.tabla).toContain("sin código aún");
  });
});

describe("cobertura por fase: formas de los reportes", () => {
  it("lee el json-summary de vitest, que no tiene envoltura files", () => {
    // La forma real: cada archivo en la raiz del objeto, con `total` al lado.
    // Con la forma de istanbul (`{ files: {...} }`) la tabla salia entera en
    // "sin codigo aun" aun con los reportes generados.
    const json = {
      total: { lines: { total: 100, covered: 90, pct: 90 } },
      "C:\\repo\\frontend\\src\\utils\\frameStats.ts": {
        lines: { total: 40, covered: 33, pct: 82.5 },
      },
      "C:\\repo\\frontend\\src\\store\\actions.ts": {
        lines: { total: 60, covered: 57, pct: 95 },
      },
    };
    const leido = deJsonSummary(json);
    expect(leido).toEqual({
      "frontend/src/utils/frameStats.ts": { total: 40, covered: 33 },
      "frontend/src/store/actions.ts": { total: 60, covered: 57 },
    });
    // Y la tabla sale con numeros, no vacia.
    expect(
      filasDe(leido)[0].areas.find((a) => a.area === "frontend/src/utils")
        .lineas,
    ).toBe(83);
  });

  it("lee el coverage.json de coverage.py", () => {
    // Forma real: coverage.py da rutas relativas al directorio de pytest, o sea
    // `app/...` porque `--cov=app` se corre desde `backend/`.
    const leido = deCoveragePy({
      files: {
        "app/main.py": { summary: { num_statements: 20, covered_lines: 19 } },
        "app/config.py": { summary: { num_statements: 5, covered_lines: 1 } },
        "app/db/__init__.py": {
          summary: { num_statements: 0, covered_lines: 0 },
        },
      },
    });
    expect(leido).toEqual({
      "backend/app/main.py": { total: 20, covered: 19 },
      "backend/app/config.py": { total: 5, covered: 1 },
    });
    // Con la fila del backend presente, F0 ya no es solo frontend.
    expect(
      filasDe(leido)[0].areas.find((a) => a.area === "backend/app").lineas,
    ).toBe(80);
  });
});

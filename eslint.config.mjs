// Solo las dos reglas del paso 0.7.9 del ROADMAP: orden de imports y la
// boundary de `shared/`. El resto del linting sigue siendo oxlint
// (`npm run lint -w frontend`, con --deny-warnings), que es más rápido y ya
// cubre react/typescript/oxc. Aquí no se solapa ninguna regla con las de
// `.oxlintrc.json`.
//
// `import-x` es el fork mantenido de `eslint-plugin-import`: el original no
// acepta ESLint 10 (dist-tags: latest=10.11.0, maintenance=9.39.5) y
// `import/order` no existe en oxlint 1.85, que además ignora en silencio las
// reglas que no conoce (medido: `--deny import/order` y `--deny
// import/regla-inventada` dan el mismo 116 rules y 0 errores, así que poner esa
// regla en `.oxlintrc.json` parecería configurada y no cumpliría nada).
import tsParser from "@typescript-eslint/parser";
import importX from "eslint-plugin-import-x";

export default [
  {
    // `shared/` es la base del grafo: todo el mundo depende de ella, así que no
    // puede depender de nadie. Sin esta regla un import de vuelta hacia
    // `frontend/` cerraría un ciclo que ni tsc ni Vite ven aquí.
    //
    // Se usa `no-restricted-imports` (core) y no `import-x/no-restricted-paths`
    // porque esta última resuelve la ruta antes de comparar, y sin
    // `eslint-import-resolver-typescript` no resuelve imports `.ts`: medido,
    // con un import directo a `store/state.types` daba 0 errores. La de core
    // compara el specifier como texto, que es justo lo que queremos aquí.
    files: ["shared/src/**/*.ts"],
    languageOptions: { parser: tsParser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/frontend/**", "**/backend/**"],
              message:
                "`shared/` es la base del grafo y no puede depender de nadie: todo el mundo depende de ella. Deja el código aquí o sube el tipo a `shared/`.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "frontend/src/**/*.{ts,tsx}",
      "frontend/tests/**/*.{ts,tsx}",
      "frontend/*.ts",
    ],
    plugins: { "import-x": importX },
    languageOptions: { parser: tsParser },
    rules: {
      // El orden de facto que ya seguía el repo (medido fichero a fichero, no
      // inventado): builtin, luego externo, luego padre, luego hermano. Con
      // línea en blanco entre grupos: es lo que ya hacen la mayoría de los
      // ficheros, y `always` cuesta 11 líneas en blanco frente a las 14 que
      // costaría `never`.
      "import-x/order": [
        "error",
        {
          groups: ["builtin", "external", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      // `@gaia/shared` se consume por su índice, nunca por un archivo suelto de
      // dentro: así `shared/src/index.ts` sigue siendo la única superficie
      // pública y se puede mover un módulo sin romper a quien lo usa. El
      // `**/` es por profundidad: el único consumidor real está a dos niveles,
      // pero el patrón tiene que aguantar los que vengan.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@gaia/shared/*", "**/shared/src/*"],
              message:
                "Importa desde '@gaia/shared' (su índice), no desde un archivo interno: el índice es la única superficie pública de `shared/`.",
            },
          ],
        },
      ],
    },
  },
];

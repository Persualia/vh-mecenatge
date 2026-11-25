import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Hexagonal dependency rule: dependencies only point inwards.
  {
    files: ["src/tracking/domain/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/*", "!@/tracking/domain/*", "next", "next/*", "react"], message: "El domini no depèn de res extern." }] }] },
  },
  {
    files: ["src/tracking/application/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/tracking/infrastructure/*", "@/components/*", "@/app/*"], message: "L’aplicació només coneix el domini i els seus ports." }] }] },
  },
  {
    files: ["src/components/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/tracking/infrastructure/*"], message: "La UI parla amb el servidor per l’API, mai amb els adaptadors." }] }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next@15 ships eslintrc-style configs, so flat config reaches
// them through FlatCompat. (Next 16 exports native flat configs; if this project
// ever moves to 16, this file collapses back to plain imports.)
const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      // Alternate build output (NEXT_DIST_DIR, see next.config.ts). Generated
      // code, and thousands of lint errors if it is ever left on disk.
      ".next-build/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // Probe-support shims. These exist to be `--require`d by Node before any
    // ESM loader runs, so they have to be CommonJS — the rule that forbids
    // require() is about application code, which this is not.
    files: ["scripts/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;

import js from "@eslint/js";
import checkFile from "eslint-plugin-check-file";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ["out/**", "dist/**", "node_modules/**"] },
  {
    plugins: { "check-file": checkFile, "simple-import-sort": simpleImportSort },
    rules: {
      quotes: ["warn", "double", { avoidEscape: true }],
      "max-depth": ["error", 3],
      "no-console": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "simple-import-sort/imports": "warn",
      "check-file/filename-naming-convention": [
        "error",
        { "src/**/*.{ts,tsx}": "KEBAB_CASE" },
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        { "src/**/": "KEBAB_CASE" },
      ],
    },
  },
);

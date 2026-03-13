import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import js from "@eslint/js";

import requireSuspenseBoundary from "./eslint-rules/require-suspense-boundary.js";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["*/index"],
              message: "Import from the directory directly without /index.",
            },
          ],
        },
      ],
    },
  },
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"],
            ["^node:"],
            ["^[^@.]", "^@(?!nema-io|web|server)"],
            ["^@nema-io/"],
            ["^@(web|server)/"],
            ["^\\."],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "no-relative-import-paths": noRelativeImportPaths,
      nema: { rules: { "require-suspense-boundary": requireSuspenseBoundary } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "nema/require-suspense-boundary": "error",
    },
  },
  {
    files: ["apps/web/**/hooks/**/*.{ts,tsx}"],
    rules: {
      "nema/require-suspense-boundary": "off",
      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        {
          allowSameFolder: true,
          rootDir: "src",
          prefix: "@web",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tolgee/react",
              importNames: ["T", "useTranslate"],
              message: "useTranslation() 훅의 t() 함수를 사용하세요.",
            },
          ],
          patterns: [
            {
              group: ["*/index"],
              message: "Import from the directory directly without /index.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/server/**/*.{ts,tsx}"],
    plugins: {
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        {
          allowSameFolder: true,
          rootDir: "src",
          prefix: "@server",
        },
      ],
    },
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ["apps/web/**/*.{ts,tsx}"],
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "apps/web/src/app/*" },
        { type: "feature", pattern: "apps/web/src/features/*" },
        { type: "component", pattern: "apps/web/src/components/*" },
        { type: "lib", pattern: "apps/web/src/lib/*" },
        { type: "hook", pattern: "apps/web/src/hooks/*" },
      ],
    },
    rules: {
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["feature", "component", "lib", "hook"] },
            { from: "feature", allow: ["component", "lib", "hook"] },
            { from: "component", allow: ["lib", "hook"] },
            { from: "hook", allow: ["lib"] },
          ],
        },
      ],
    },
  },
  prettier,
  { rules: { curly: "error" } },
);

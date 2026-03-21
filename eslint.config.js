import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import jsonc from "eslint-plugin-jsonc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import noRelativeImportPaths from "eslint-plugin-no-relative-import-paths";
import reactCompiler from "eslint-plugin-react-compiler";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";
import js from "@eslint/js";

import noDirectTrpcHooks from "./eslint-rules/no-direct-trpc-hooks.js";
import noForbiddenBreakpoints from "./eslint-rules/no-forbidden-breakpoints.js";
import noGenericVariableNames from "./eslint-rules/no-generic-variable-names.js";
import requireNamedPropsInterface from "./eslint-rules/require-named-props-interface.js";
import requireObjectParams from "./eslint-rules/require-object-params.js";
import requireSuspenseBoundary from "./eslint-rules/require-suspense-boundary.js";

const nemaPlugin = {
  rules: {
    "no-direct-trpc-hooks": noDirectTrpcHooks,
    "no-forbidden-breakpoints": noForbiddenBreakpoints,
    "no-generic-variable-names": noGenericVariableNames,
    "require-named-props-interface": requireNamedPropsInterface,
    "require-object-params": requireObjectParams,
    "require-suspense-boundary": requireSuspenseBoundary,
  },
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { nema: nemaPlugin },
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
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        {
          assertionStyle: "as",
          objectLiteralTypeAssertions: "never",
        },
      ],
      "nema/no-generic-variable-names": "error",
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
      "react-compiler": reactCompiler,
      "react-hooks": reactHooks,
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      "react-compiler/react-compiler": "error",
      ...reactHooks.configs["recommended-latest"].rules,
      "nema/require-suspense-boundary": "error",
      "nema/require-named-props-interface": "error",
      "nema/no-forbidden-breakpoints": "error",
      "nema/no-direct-trpc-hooks": "error",
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='useEffect'] > ArrowFunctionExpression",
          message: "useEffect callback must be a named function.",
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
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        {
          allowSameFolder: true,
          rootDir: "src",
          prefix: "@web",
        },
      ],
    },
  },
  {
    files: ["apps/web/**/hooks/**/*.{ts,tsx}"],
    rules: {
      "nema/require-suspense-boundary": "off",
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
      "nema/require-object-params": "error",
      "no-console": ["error", { allow: ["warn"] }],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@supabase/supabase-js",
              importNames: ["SupabaseClient"],
              message:
                "Use TypedSupabaseClient from @server/infra/supabase for type-safe DB access.",
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
    ...jsxA11y.flatConfigs.recommended,
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "jsx-a11y/no-autofocus": "off",
    },
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
            { from: "feature", allow: ["feature", "component", "lib", "hook"] },
            { from: "component", allow: ["lib", "hook"] },
            { from: "hook", allow: ["lib"] },
          ],
        },
      ],
      "boundaries/entry-point": [
        "error",
        {
          default: "allow",
          rules: [{ target: "feature", allow: "index.(ts|tsx)" }],
        },
      ],
    },
  },
  // --- Overrides ---
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
      ],
      "no-console": "off",
    },
  },
  {
    files: ["apps/server/src/eval/**/*.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["apps/web/src/app/components/devtools/**/*.{ts,tsx}"],
    rules: { "nema/no-direct-trpc-hooks": "off" },
  },
  {
    files: ["packages/weave/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-assertions": [
        "error",
        { assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
      ],
    },
  },
  {
    files: ["apps/server/src/infra/supabase.ts"],
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
    files: ["apps/web/src/lib/tolgee/useTranslation.ts"],
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
  ...jsonc.configs["flat/base"].map((config) => ({
    ...config,
    files: [
      "apps/web/src/lib/tolgee/*.json",
      "apps/server/src/infra/i18n/locales/*.json",
    ],
  })),
  {
    files: [
      "apps/web/src/lib/tolgee/*.json",
      "apps/server/src/infra/i18n/locales/*.json",
    ],
    rules: {
      "jsonc/sort-keys": "error",
    },
  },
  prettier,
  { rules: { curly: "error", "no-nested-ternary": "error" } },
);

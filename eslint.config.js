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
import noRawColorValue from "./eslint-rules/no-raw-color-value.js";
import requireNamedPropsInterface from "./eslint-rules/require-named-props-interface.js";
import requireObjectParams from "./eslint-rules/require-object-params.js";
import requireStateFgToken from "./eslint-rules/require-state-fg-token.js";
import requireSuspenseBoundary from "./eslint-rules/require-suspense-boundary.js";

const nemaPlugin = {
  rules: {
    "no-direct-trpc-hooks": noDirectTrpcHooks,
    "no-forbidden-breakpoints": noForbiddenBreakpoints,
    "no-generic-variable-names": noGenericVariableNames,
    "no-raw-color-value": noRawColorValue,
    "require-named-props-interface": requireNamedPropsInterface,
    "require-object-params": requireObjectParams,
    "require-state-fg-token": requireStateFgToken,
    "require-suspense-boundary": requireSuspenseBoundary,
  },
};

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**", "legacy/**"] },
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
    // Tailwind className 문자열을 겨냥한 룰 — 서버·설정 파일 등 JSX/스타일링과
    // 무관한 영역까지 스캔하면 우연히 매칭되는 문자열에 오탐할 수 있어 범위를
    // 좁힌다. .ts도 포함하는 이유: className 상수(SPACE_PILL_CLASSNAME 등)가
    // .tsx가 아닌 .ts 파일에도 있다.
    files: ["apps/web/**/*.{ts,tsx}", "packages/weave/**/*.{ts,tsx}"],
    plugins: { nema: nemaPlugin },
    rules: {
      "nema/require-state-fg-token": "error",
      "nema/no-raw-color-value": "error",
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
            {
              name: "@nema-io/weave/icons",
              importNames: ["LucideIcon"],
              message:
                "Do not import LucideIcon directly. Define a project-level alias if an icon type is needed.",
            },
            {
              name: "@nema-io/weave",
              importNames: ["Dialog", "DropdownMenu", "Popover", "Select"],
              message:
                "Esc로 닫히는 오버레이는 @web/components/ui의 래퍼를 사용하세요 (전역 단축키 레지스트리 연동).",
            },
          ],
          patterns: [
            {
              group: ["*/index"],
              message: "Import from the directory directly without /index.",
            },
            {
              group: ["@web/features/**/*Page"],
              message:
                "Page components (*Page) must live in app/pages/, not in features/.",
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
    files: ["apps/mcp/**/*.{ts,tsx}"],
    plugins: {
      "no-relative-import-paths": noRelativeImportPaths,
    },
    rules: {
      "no-relative-import-paths/no-relative-import-paths": [
        "error",
        {
          allowSameFolder: true,
          rootDir: "src",
          prefix: "@mcp",
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
    // Dialog/DropdownMenu/Popover/Select 래퍼 자신은 위에서 금지한 weave 프리미티브를
    // 직접 import해야 하므로 제외한다.
    files: [
      "apps/web/src/components/ui/{Dialog,DropdownMenu,Popover,Select}.tsx",
    ],
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

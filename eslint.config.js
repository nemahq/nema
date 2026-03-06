import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.turbo/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
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
);

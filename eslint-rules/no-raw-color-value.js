const RAW_COLOR_RE =
  /\b(?:text|bg|border|ring|fill|stroke|from|via|to|outline|shadow|accent|decoration)-\[(#|rgb|hsl)/g;
const CSS_UTILS = new Set(["cn", "clsx", "cva", "tw", "twMerge"]);

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Tailwind arbitrary color values (bg-[#...], text-[rgb(...)], ...) are forbidden. Use a design token instead.",
    },
    messages: {
      forbidden:
        "`{{ match }}` bypasses the design token system. Use an existing token (bg-surface-*, text-fg-*, border-*, ...) or add one to packages/weave/src/tokens/index.css.",
    },
    schema: [],
  },

  create(context) {
    function checkString(node, value) {
      for (const match of value.matchAll(RAW_COLOR_RE)) {
        context.report({
          node,
          messageId: "forbidden",
          data: { match: match[0] },
        });
      }
    }

    return {
      JSXAttribute(node) {
        if (
          node.name?.name === "className" &&
          node.value?.type === "Literal" &&
          typeof node.value.value === "string"
        ) {
          checkString(node.value, node.value.value);
        }
      },

      TemplateLiteral(node) {
        const parent = node.parent;
        if (
          parent.type !== "JSXExpressionContainer" ||
          parent.parent?.type !== "JSXAttribute" ||
          parent.parent.name?.name !== "className"
        ) {
          return;
        }
        for (const quasi of node.quasis) {
          checkString(quasi, quasi.value.raw);
        }
      },

      CallExpression(node) {
        const name =
          node.callee.type === "Identifier" ? node.callee.name : null;
        if (!name || !CSS_UTILS.has(name)) {
          return;
        }
        for (const arg of node.arguments) {
          if (arg.type === "Literal" && typeof arg.value === "string") {
            checkString(arg, arg.value);
          }
        }
      },
    };
  },
};

const FORBIDDEN_RE = /\b(?:sm|lg|xl|2xl):/g;
const CSS_UTILS = new Set(["cn", "clsx", "cva", "tw", "twMerge"]);

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Only `md:` breakpoint is allowed. `sm:`, `lg:`, `xl:`, `2xl:` are forbidden.",
    },
    messages: {
      forbidden:
        "Breakpoint `{{ match }}` is not allowed. Use only `md:` (768px).",
    },
    schema: [],
  },

  create(context) {
    function checkString(node, value) {
      for (const match of value.matchAll(FORBIDDEN_RE)) {
        context.report({
          node,
          messageId: "forbidden",
          data: { match: match[0] },
        });
      }
    }

    return {
      // className="sm:hidden"
      JSXAttribute(node) {
        if (
          node.name?.name === "className" &&
          node.value?.type === "Literal" &&
          typeof node.value.value === "string"
        ) {
          checkString(node.value, node.value.value);
        }
      },

      // template literals: className={`sm:hidden ${...}`}
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

      // cn("sm:hidden", ...) / clsx / tw / cva 등 CSS utility 호출의 문자열 인자
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

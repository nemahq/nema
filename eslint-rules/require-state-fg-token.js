const FG_UTILITY_RE = /text-fg-([a-z]+)$/;
const CSS_UTILS = new Set(["cn", "clsx", "cva", "tw", "twMerge"]);

const EXPECTED = {
  disabled: "quinary",
  placeholder: "quaternary",
};

// 한 클래스 토큰이 어떤 상태를 칠하는지 판정한다. disabled가 우선인 이유:
// disabled:placeholder:text-* 는 "비활성일 때의 placeholder"라 비활성 쪽이다.
function stateOf(token) {
  if (/(^|:)disabled:/.test(token) || token.includes("[disabled]")) {
    return "disabled";
  }
  if (/(^|:)placeholder:/.test(token) || token.includes("[placeholder]")) {
    return "placeholder";
  }
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "placeholder must use text-fg-quaternary and disabled must use text-fg-quinary.",
    },
    messages: {
      mismatch:
        "`{{ token }}` uses text-fg-{{ actual }}. {{ state }} state must use text-fg-{{ expected }}.",
    },
    schema: [],
  },

  create(context) {
    function checkString(node, value) {
      for (const token of value.split(/\s+/)) {
        const utility = FG_UTILITY_RE.exec(token);
        if (!utility) {
          continue;
        }
        const state = stateOf(token);
        if (!state) {
          continue;
        }
        const actual = utility[1];
        const expected = EXPECTED[state];
        if (actual !== expected) {
          context.report({
            node,
            messageId: "mismatch",
            data: { token, actual, expected, state },
          });
        }
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

      VariableDeclarator(node) {
        if (
          node.init?.type === "Literal" &&
          typeof node.init.value === "string"
        ) {
          checkString(node.init, node.init.value);
        }
      },
    };
  },
};

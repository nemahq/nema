const FORBIDDEN = new Set(["data", "value", "item"]);

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Variable declarations must use domain-specific names, not generic ones like `data`, `value`, `item`.",
    },
    messages: {
      generic:
        "Avoid generic variable name `{{ name }}`. Use a domain-specific name instead (e.g., `data` → `sessionDetail`).",
    },
    schema: [],
  },

  create(context) {
    return {
      VariableDeclarator(node) {
        // 구조분해는 외부 API 반환 형태에 의존하므로 제외
        if (node.id.type !== "Identifier") {
          return;
        }

        if (FORBIDDEN.has(node.id.name)) {
          context.report({
            node: node.id,
            messageId: "generic",
            data: { name: node.id.name },
          });
        }
      },
    };
  },
};

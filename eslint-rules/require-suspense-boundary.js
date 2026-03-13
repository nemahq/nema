/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "useSuspenseQuery / useSuspenseInfiniteQuery를 호출하는 파일은 반드시 Suspense를 import해야 합니다.",
    },
    messages: {
      missing:
        "이 파일에서 {{ name }}을 사용하지만 Suspense를 import하지 않았습니다. Suspense 경계를 co-locate하세요.",
    },
    schema: [],
  },

  create(context) {
    const PATTERN = /^useSuspense(Infinite)?Query$/;
    let hasSuspenseImport = false;
    /** @type {import("estree").Node[]} */
    const suspenseCalls = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "react") {
          return;
        }
        if (
          node.specifiers.some(
            (s) =>
              s.type === "ImportSpecifier" && s.imported.name === "Suspense",
          )
        ) {
          hasSuspenseImport = true;
        }
      },

      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          PATTERN.test(callee.property.name)
        ) {
          suspenseCalls.push({
            node: callee.property,
            name: callee.property.name,
          });
        }
      },

      "Program:exit"() {
        if (hasSuspenseImport || suspenseCalls.length === 0) {
          return;
        }
        for (const { node, name } of suspenseCalls) {
          context.report({ node, messageId: "missing", data: { name } });
        }
      },
    };
  },
};

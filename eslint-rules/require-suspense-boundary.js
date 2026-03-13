/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Files calling useSuspenseQuery / useSuspenseInfiniteQuery must import Suspense from React.",
    },
    messages: {
      missing:
        "This file uses {{ name }} but does not import Suspense. Co-locate a Suspense boundary in the same file.",
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

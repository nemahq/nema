const MAX_POSITIONAL_PARAMS = 2;

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "suggestion",
    docs: {
      description: `Functions with ${MAX_POSITIONAL_PARAMS + 1}+ parameters must use an object parameter pattern.`,
    },
    messages: {
      tooMany:
        "Function {{ name }} has {{ count }} positional parameters. Use an object parameter when there are 3+.",
    },
    schema: [],
  },

  create(context) {
    function check(node, name) {
      const params = node.params;
      if (params.length <= MAX_POSITIONAL_PARAMS) {
        return;
      }

      // 이미 단일 객체 destructuring이면 OK
      if (params.length === 1 && params[0].type === "ObjectPattern") {
        return;
      }

      context.report({
        node,
        messageId: "tooMany",
        data: { name: name || "<anonymous>", count: String(params.length) },
      });
    }

    return {
      FunctionDeclaration(node) {
        check(node, node.id?.name);
      },

      // arrow / function expressions assigned to a variable
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          node.init &&
          (node.init.type === "ArrowFunctionExpression" ||
            node.init.type === "FunctionExpression")
        ) {
          check(node.init, node.id.name);
        }
      },

      // methods in object literals / classes (exclude constructors)
      MethodDefinition(node) {
        if (node.kind === "constructor") {
          return;
        }
        check(node.value, node.key?.name);
      },

      Property(node) {
        if (
          node.value &&
          (node.value.type === "FunctionExpression" ||
            node.value.type === "ArrowFunctionExpression")
        ) {
          check(node.value, node.key?.name);
        }
      },
    };
  },
};

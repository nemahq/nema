/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "React component props must be typed with a named interface `{ComponentName}Props`.",
    },
    messages: {
      missing:
        "Component {{ name }} props must use `interface {{ expected }}` (not inline types or generic `Props`).",
    },
    schema: [],
  },

  create(context) {
    /**
     * Check if a node looks like a React component:
     * - PascalCase name
     * - Returns JSX (we approximate by checking the first param type annotation)
     */
    function isComponentName(name) {
      return /^[A-Z][a-zA-Z0-9]*$/.test(name);
    }

    function checkComponent(node, name) {
      if (!isComponentName(name)) {
        return;
      }
      const params = node.params;
      if (params.length === 0) {
        return;
      }

      const firstParam = params[0];
      const typeAnnotation = firstParam.typeAnnotation?.typeAnnotation ?? null;

      if (!typeAnnotation) {
        return;
      }

      const expected = `${name}Props`;

      // named type reference → OK unless it's the generic "Props"
      if (typeAnnotation.type === "TSTypeReference") {
        const typeName =
          typeAnnotation.typeName?.name ?? typeAnnotation.typeName?.right?.name;
        if (typeName && typeName !== "Props") {
          return;
        }
      }

      context.report({
        node: firstParam,
        messageId: "missing",
        data: { name, expected },
      });
    }

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          checkComponent(node, node.id.name);
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          node.init &&
          (node.init.type === "ArrowFunctionExpression" ||
            node.init.type === "FunctionExpression")
        ) {
          checkComponent(node.init, node.id.name);
        }
      },
    };
  },
};

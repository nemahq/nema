const TRPC_HOOK_RE =
  /^use(?:Query|Mutation|Suspense(?:Infinite)?Query|InfiniteQuery|Subscription)$/;

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "tRPC hooks must not be called directly in components. Wrap in a custom hook.",
    },
    messages: {
      direct:
        "Do not call tRPC hooks directly in components. Wrap `{{ name }}` in a custom hook under `hooks/`.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.filename || "";

    // hooks/ 폴더 안이면 허용
    if (/\/hooks\//.test(filename)) {
      return {};
    }

    // context 파일도 허용 (provider에서 subscription 등)
    if (/\/contexts?\//.test(filename)) {
      return {};
    }

    return {
      // trpc.foo.bar.useQuery() 패턴 감지
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== "MemberExpression" ||
          callee.property.type !== "Identifier" ||
          !TRPC_HOOK_RE.test(callee.property.name)
        ) {
          return;
        }

        // trpc로 시작하는 체인인지 확인
        let obj = callee.object;
        while (obj.type === "MemberExpression") {
          obj = obj.object;
        }

        if (obj.type === "Identifier" && obj.name === "trpc") {
          context.report({
            node: callee.property,
            messageId: "direct",
            data: { name: callee.property.name },
          });
        }
      },
    };
  },
};

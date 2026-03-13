import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SUSPENSE_QUERY_RE = /useSuspense(?:Infinite)?Query/;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** @type {Map<string, boolean>} base import path → contains suspense query */
const cache = new Map();

/**
 * Resolve @web/ alias or relative import to a base file path (without extension).
 * Returns null for unresolvable sources (node_modules, etc.).
 */
function resolveBasePath(source, currentFile) {
  if (source.startsWith("@web/")) {
    const i = currentFile.indexOf("/apps/web/src/");
    if (i === -1) {
      return null;
    }
    return currentFile.slice(0, i) + "/apps/web/src/" + source.slice(5);
  }
  if (source.startsWith(".")) {
    return resolve(dirname(currentFile), source);
  }
  return null;
}

/**
 * Check if the file at the resolved import path contains useSuspenseQuery.
 * Results are cached per ESLint run.
 */
function importedHookUsesSuspense(source, currentFile) {
  const basePath = resolveBasePath(source, currentFile);
  if (!basePath) {
    return false;
  }
  if (cache.has(basePath)) {
    return cache.get(basePath);
  }

  for (const ext of EXTENSIONS) {
    try {
      const content = readFileSync(basePath + ext, "utf-8");
      const result = SUSPENSE_QUERY_RE.test(content);
      cache.set(basePath, result);
      return result;
    } catch {
      // extension not found, try next
    }
  }

  cache.set(basePath, false);
  return false;
}

/** @type {import("eslint").Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Components using suspense queries (directly or via custom hooks) must co-locate a Suspense boundary in the same file.",
    },
    messages: {
      missing:
        "This file uses {{ name }} but does not import Suspense. Co-locate a Suspense boundary in the same file.",
      missingIndirect:
        "{{ name }} uses a suspense query internally. Co-locate a Suspense boundary in this file.",
    },
    schema: [],
  },

  create(context) {
    const DIRECT_PATTERN = /^useSuspense(Infinite)?Query$/;
    let hasSuspenseImport = false;
    /** @type {import("estree").Identifier[]} */
    const directCalls = [];
    /** @type {{ node: import("estree").Node, name: string }[]} */
    const indirectHooks = [];

    return {
      ImportDeclaration(node) {
        if (node.source.value === "react") {
          if (
            node.specifiers.some(
              (s) =>
                s.type === "ImportSpecifier" && s.imported.name === "Suspense",
            )
          ) {
            hasSuspenseImport = true;
          }
          return;
        }

        const currentFile = context.filename;
        if (!currentFile || currentFile === "<text>") {
          return;
        }

        for (const spec of node.specifiers) {
          const name =
            spec.type === "ImportSpecifier"
              ? spec.imported.name
              : spec.local?.name;
          if (!name || !/^use[A-Z]/.test(name)) {
            continue;
          }
          if (importedHookUsesSuspense(node.source.value, currentFile)) {
            indirectHooks.push({ node: spec, name });
          }
        }
      },

      CallExpression(node) {
        const callee = node.callee;
        if (callee.type === "Identifier" && DIRECT_PATTERN.test(callee.name)) {
          directCalls.push(callee);
        } else if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          DIRECT_PATTERN.test(callee.property.name)
        ) {
          directCalls.push(callee.property);
        }
      },

      "Program:exit"() {
        if (hasSuspenseImport) {
          return;
        }
        if (directCalls.length === 0 && indirectHooks.length === 0) {
          return;
        }

        for (const node of directCalls) {
          context.report({
            node,
            messageId: "missing",
            data: { name: node.name },
          });
        }

        for (const { node, name } of indirectHooks) {
          context.report({
            node,
            messageId: "missingIndirect",
            data: { name },
          });
        }
      },
    };
  },
};

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SUSPENSE_QUERY_RE = /useSuspense(?:Infinite)?Query/;
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

/** @type {Map<string, string | null>} base import path → file content */
const fileCache = new Map();
/** @type {Map<string, boolean>} "basePath::hookName" → uses suspense */
const hookCache = new Map();

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

function readSourceFile(basePath) {
  if (fileCache.has(basePath)) {
    return fileCache.get(basePath);
  }
  for (const ext of EXTENSIONS) {
    try {
      const content = readFileSync(basePath + ext, "utf-8");
      fileCache.set(basePath, content);
      return content;
    } catch (err) {
      if (err?.code !== "ENOENT") {
        throw err;
      }
    }
  }
  fileCache.set(basePath, null);
  return null;
}

/**
 * Extract the body of `export function <hookName>` and check if it contains
 * useSuspenseQuery. Uses a simple brace-counting approach.
 */
function hookBodyUsesSuspense(content, hookName) {
  const pattern = new RegExp(
    `export\\s+function\\s+${hookName}\\s*(?:<[^>]*>)?\\s*\\(`,
  );
  const match = pattern.exec(content);
  if (!match) {
    return false;
  }

  let depth = 0;
  let started = false;
  const start = match.index + match[0].length;
  for (let i = start; i < content.length; i++) {
    if (content[i] === "{") {
      depth++;
      started = true;
    } else if (content[i] === "}") {
      depth--;
      if (started && depth === 0) {
        const body = content.slice(start, i);
        return SUSPENSE_QUERY_RE.test(body);
      }
    }
  }
  return false;
}

/**
 * Check if a specific imported hook uses suspense queries.
 */
function importedHookUsesSuspense(source, currentFile, hookName) {
  const basePath = resolveBasePath(source, currentFile);
  if (!basePath) {
    return false;
  }

  const cacheKey = `${basePath}::${hookName}`;
  if (hookCache.has(cacheKey)) {
    return hookCache.get(cacheKey);
  }

  const content = readSourceFile(basePath);
  if (!content) {
    hookCache.set(cacheKey, false);
    return false;
  }

  const result = hookBodyUsesSuspense(content, hookName);
  hookCache.set(cacheKey, result);
  return result;
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
          if (importedHookUsesSuspense(node.source.value, currentFile, name)) {
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

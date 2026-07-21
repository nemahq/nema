#!/usr/bin/env node
// "무조건 weave"가 아니라 "먼저 검토하고 안 쓰면 이유를 남긴다"는 맥락 판단이라
// 린트로 못 잡는다 — 훅이 후보를 짚어 모델이 직접 판단하게 한다.

import { readFileSync } from "node:fs";

const TARGET_PATH_RE = /\/(apps\/web|packages\/weave)\/src\/.*\.tsx$/;
const SIGNAL_RE = /(<button\b|<input\b|<textarea\b|<label\b)/;

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function collectAddedText(toolName, toolInput) {
  if (!toolInput) return "";
  if (toolName === "Write") return toolInput.content ?? "";
  if (toolName === "Edit") return toolInput.new_string ?? "";
  if (toolName === "MultiEdit") {
    return (toolInput.edits ?? []).map((edit) => edit?.new_string ?? "").join("\n");
  }
  return "";
}

let data;
try {
  data = JSON.parse(readStdin());
} catch {
  process.exit(0);
}

const toolInput = data.tool_input;
const filePath = toolInput?.file_path ?? "";
if (!TARGET_PATH_RE.test(filePath)) process.exit(0);

const addedText = collectAddedText(data.tool_name, toolInput);
const match = SIGNAL_RE.exec(addedText);
if (!match) process.exit(0);

const additionalContext =
  `This edit to ${filePath} adds a raw \`${match[1]}\` tag. Before keeping it: check ` +
  `packages/weave/src/index.ts for a matching component, and read docs/guides/weave-usage.md ` +
  `(component decision table + when NOT to use weave). If weave is intentionally skipped here, ` +
  `leave a short comment explaining why — that judgment isn't enforceable by lint.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
    suppressOutput: true,
  }),
);
process.exit(0);

#!/usr/bin/env node
// PostToolUse 훅: 코드 편집에 "설명형 주석"이 늘어나면 자가 점검을 유도한다.
// root CLAUDE.md "Comments" 정책(코드를 그대로 옮겨 적는 주석 금지)은 린트로
// 잡을 수 없는 의미 판단이라, 훅은 후보를 짚어 모델이 직접 지우게 한다.

import { readFileSync } from "node:fs";

const COMMENT_NUDGE_THRESHOLD = 2; // 이 개수 이상의 비지시성 주석이 추가되면 알린다
const SAMPLE_LIMIT = 5; // additionalContext에 예시로 넣을 주석 줄 수
const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

// 지시성/허용 주석 — 정책 위반으로 세지 않는다.
const ALLOWED_COMMENT =
  /(TODO|FIXME|HACK|XXX|@ts-|eslint-|biome-ignore|prettier-ignore|@deprecated|v8 ignore|c8 ignore)/;

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

// `//` 라인 주석만 센다. JSDoc·라이선스 등 블록 주석(/* * */)은 대개 의도
// 문서라 제외하며, 이로써 함수 문서화마다 nudge가 터지는 오탐도 사라진다.
function findExplanatoryComments(text) {
  const offenders = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("//")) continue;
    if (ALLOWED_COMMENT.test(line)) continue;
    offenders.push(line);
  }
  return offenders;
}

let data;
try {
  data = JSON.parse(readStdin());
} catch {
  process.exit(0);
}

const toolInput = data.tool_input;
const filePath = toolInput?.file_path ?? "";
if (!CODE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) process.exit(0);

const offenders = findExplanatoryComments(collectAddedText(data.tool_name, toolInput));
if (offenders.length < COMMENT_NUDGE_THRESHOLD) process.exit(0);

const sample = offenders
  .slice(0, SAMPLE_LIMIT)
  .map((line) => `  ${line}`)
  .join("\n");

const additionalContext =
  `Project comment policy (root CLAUDE.md → Comments): comments must not restate what the code ` +
  `already expresses; they are reserved for TODO and intent/context that code alone cannot convey. ` +
  `This edit to ${filePath} includes ${offenders.length} explanatory comment line(s):\n${sample}\n` +
  `Any of these that merely describe what the adjacent code does should be removed; ` +
  `keep only the ones conveying non-obvious intent.`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext },
    suppressOutput: true,
  }),
);
process.exit(0);

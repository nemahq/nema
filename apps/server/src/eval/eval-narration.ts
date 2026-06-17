// 실행: pnpm tsx apps/server/src/eval/eval-narration.ts
// 결론 금지 1차 수동 측정 — 근거 묶음을 고정 입력으로 주고 산문이 (a) 근거 위에 머물고
// (b) 빈 곳을 인정하며 (c) [s:id] 마커를 다는지 눈으로 본다. 정식 평가셋은 후속(narration-design 9장).

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";
import { DEFAULT_STANDARD_MODEL } from "@server/infra/llm/models";
import { OpenAiProvider } from "@server/infra/llm/openai-provider";
import { NARRATION_SYSTEM_PROMPT } from "@server/prompts/narration";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadEnv(resolve(__dirname, "../.."));

interface NarrationCase {
  name: string;
  message: string;
  // 출력에 등장하면 결론 금지를 의심해야 하는 표현(인과·평가). 자동 플래그용.
  redFlags: string[];
}

const CASES: NarrationCase[] = [
  {
    name: "근거 위 멈춤 (인과 지어내기 유혹)",
    message: `Question: 이거 왜 채널 우선순위를 뒤집었지?

Statements found:
[s:a1] (claim, certain) 채널 1순위는 인스타그램으로 잡는다  {superseded by s:a2}
[s:a2] (claim, certain) 채널 1순위를 유튜브로 바꾼다
[s:a3] (claim, certain) 광고비 인상 뒤 인스타 도달률이 급감했다`,
    redFlags: ["때문에", "그래서", "ROI", "더 나은", "효율"],
  },
  {
    name: "빈 곳 인정",
    message: `Question: 그래서 예산은 어떻게 재배분했어?

Statements found:
(none)`,
    redFlags: ["예산은", "배분했"],
  },
];

async function collect(
  provider: LlmProvider,
  message: string,
): Promise<string> {
  let text = "";
  for await (const chunk of provider.generateStream({
    systemPrompt: NARRATION_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
  })) {
    text += chunk;
  }
  return text;
}

async function main() {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (!apiKey) {
    console.error("OPENAI_API_KEY environment variable is required");
    process.exit(1);
  }

  const provider = new OpenAiProvider({
    apiKey,
    model: DEFAULT_STANDARD_MODEL,
  });

  for (const testCase of CASES) {
    console.log(`\n=== ${testCase.name} ===`);
    const output = await collect(provider, testCase.message);
    console.log(output);

    const hasMarker = /\[s:[^\]]+\]/.test(output);
    const flagged = testCase.redFlags.filter((flag) => output.includes(flag));
    console.log(`\n[check] [s:id] 마커: ${hasMarker ? "O" : "X"}`);
    console.log(
      `[check] 의심 표현: ${flagged.length > 0 ? flagged.join(", ") : "없음"}`,
    );
  }
}

main();

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { NARRATION_SYSTEM_PROMPT } from "@server/prompts/narration";

import { assembleEvidence, type Evidence } from "./assemble-evidence";
import type { SearchedStatement } from "./statement-search";

type NarrationStreamEvent =
  | { type: "evidence"; evidence: Evidence }
  | { type: "token"; text: string };

export async function* handleNarrationStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  query: string;
  topicIds?: string[];
  signal?: AbortSignal;
}): AsyncGenerator<NarrationStreamEvent> {
  const { supabase, providers, query, topicIds, signal } = args;

  // 근거를 먼저 확정해 통째로 내보낸다 — 산문은 늘 이미 나간 근거 위에서만 자란다 (narration-design 7장).
  const evidence = await assembleEvidence({
    supabase,
    providers,
    query,
    topicIds,
  });
  yield { type: "evidence", evidence };

  for await (const chunk of providers.llm.forTask("narrate").generateStream({
    systemPrompt: NARRATION_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildNarrationUserMessage(query, evidence) },
    ],
    signal,
  })) {
    yield { type: "token", text: chunk };
  }
}

// 근거 묶음을 LLM 입력으로 직렬화한다. 진술마다 id를 노출해 산문이 [s:<id>] 마커로 가리키게 한다.
function buildNarrationUserMessage(query: string, evidence: Evidence): string {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const group of evidence.groups) {
    for (const statement of group.statements) {
      if (seen.has(statement.id)) {
        continue;
      }
      seen.add(statement.id);
      found.push(formatStatement(statement));
    }
  }

  const referenced = evidence.relatedStatements
    .filter((related) => !seen.has(related.id))
    .map((related) => `[s:${related.id}] (${related.type}) ${related.content}`);

  const sections = [
    `Question: ${query}`,
    "",
    "Statements found:",
    found.length > 0 ? found.join("\n") : "(none)",
  ];
  if (referenced.length > 0) {
    sections.push(
      "",
      "Referenced statements (targets of the markers above):",
      referenced.join("\n"),
    );
  }
  return sections.join("\n");
}

function formatStatement(statement: SearchedStatement): string {
  const meta = statement.confidence
    ? `${statement.type}, ${statement.confidence}`
    : statement.type;
  const markers = [
    ...(statement.supersededBy ?? []).map((id) => `superseded by s:${id}`),
    ...(statement.conflictsWith ?? []).map((id) => `conflicts with s:${id}`),
    ...(statement.resolvedBy ?? []).map((id) => `resolved by s:${id}`),
  ];
  const markerText = markers.length > 0 ? `  {${markers.join("; ")}}` : "";
  return `[s:${statement.id}] (${meta}) ${statement.content}${markerText}`;
}

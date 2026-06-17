import * as Sentry from "@sentry/node";

import {
  DRAFT_TITLE_MAX_LENGTH,
  DRAFT_TOPICS_MAX,
  type DraftAssistInput,
  TOPIC_NAME_MAX_LENGTH,
} from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  buildDraftAssistMessage,
  DRAFT_ASSIST_SYSTEM_PROMPT,
  DraftAssistOutputSchema,
} from "@server/prompts/draft-assist";
import { createDraft } from "@server/services/draft-service";
import { listTopicNames } from "@server/services/topic-service";

// LLM 출력은 신뢰 경계 밖이라 길이·개수·중복을 코드로 강제한다(프롬프트 지시만으론 불충분).
export function sanitizeTopics(raw: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawTopic of raw) {
    const name = rawTopic.trim().slice(0, TOPIC_NAME_MAX_LENGTH);
    if (name === "" || seen.has(name)) {
      continue;
    }
    seen.add(name);
    result.push(name);
    if (result.length >= DRAFT_TOPICS_MAX) {
      break;
    }
  }
  return result;
}

// 외부 입구(MCP)가 Claude Code로 하는 일을 앱 입구에서 대칭으로 수행한다.
export async function assistDraft(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  input: DraftAssistInput;
}): Promise<{ draftId: string }> {
  const { supabase, providers, input } = args;

  const existingTopics = await listTopicNames(supabase);

  const output = await providers.llm.forTask("assistDraft").generateStructured({
    schema: DraftAssistOutputSchema,
    schemaName: "draft_assist",
    systemPrompt: DRAFT_ASSIST_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildDraftAssistMessage(input.body, existingTopics),
      },
    ],
  });

  const title = output.title.trim().slice(0, DRAFT_TITLE_MAX_LENGTH);

  // 정제 본문이 비면 원문을 살린다 — 넣은 내용을 잃지 않는다. 다만 비어있지 않은 입력에
  // LLM이 빈 본문을 낸 건 이상 신호라, 무음 fallback이 성공처럼 보이지 않게 흔적을 남긴다.
  const refinedBody = output.body.trim();
  if (refinedBody === "") {
    Sentry.captureMessage(
      "draft-assist produced empty body for non-empty input",
      {
        level: "warning",
        tags: { component: "draft-assist" },
      },
    );
  }
  const body = refinedBody || input.body.trim();

  return createDraft({
    supabase,
    input: {
      origin: "in_app",
      title: title === "" ? undefined : title,
      body,
      proposedTopics: sanitizeTopics(output.topics),
    },
  });
}

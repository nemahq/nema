import type { ContentLanguage } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import type { JudgmentItem } from "@server/prompts/saving";
import {
  buildJudgmentMessage,
  buildMetaMessage,
  buildSplitMessage,
  JUDGMENT_SYSTEM_PROMPT,
  JudgmentOutputSchema,
  META_SYSTEM_PROMPT,
  MetaOutputSchema,
  SPLIT_SYSTEM_PROMPT,
  SplitOutputSchema,
} from "@server/prompts/saving";

const VECTOR_SEARCH_LIMIT = 20;
const VECTOR_SCORE_THRESHOLD = 0.7;

export async function handleSave(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  draftBody: string;
  contentLanguage: ContentLanguage;
}): Promise<{ titles: string[]; historyId: string }> {
  const { supabase, providers, userId, sessionId, draftBody } = args;
  const { embedding, vectorStore, llm } = providers;

  // Step 1: 토픽 분리
  const splitOutput = await llm.mini.generateStructured({
    schema: SplitOutputSchema,
    schemaName: "saving_split",
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
  });

  // Step 2-3: 토픽별 벡터 검색 + JUDGMENT
  const allItems: JudgmentItem[] = [];

  for (const topic of splitOutput.topics) {
    const searchResults = await vectorStore.search(embedding, {
      userId,
      query: topic,
      limit: VECTOR_SEARCH_LIMIT,
      scoreThreshold: VECTOR_SCORE_THRESHOLD,
    });

    const candidateIds = [
      ...new Set(searchResults.map((r) => r.payload.doc_id)),
    ];

    let candidates: Array<{ id: string; body: string }> = [];
    if (candidateIds.length > 0) {
      const { data, error } = await supabase
        .from("memories")
        .select("id, body")
        .in("id", candidateIds);
      throwIfSupabaseError(error);
      candidates = data ?? [];
    }

    const judgmentOutput = await llm.standard.generateStructured({
      schema: JudgmentOutputSchema,
      schemaName: "saving_judgment",
      systemPrompt: JUDGMENT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildJudgmentMessage(topic, candidates),
        },
      ],
    });

    allItems.push(...judgmentOutput.items);
  }

  // Step 4: History 생성
  const { data: history, error: historyError } = await supabase
    .from("histories")
    .insert({
      user_id: userId,
      source_session_id: sessionId,
      source_draft_body: draftBody,
    })
    .select("id")
    .single();
  throwIfSupabaseError(historyError);
  const historyId = history.id;

  // Step 5: META 생성 + DB 기록
  const titles: string[] = [];

  for (const judgmentItem of allItems) {
    const meta = await llm.mini.generateStructured({
      schema: MetaOutputSchema,
      schemaName: "saving_meta",
      systemPrompt: META_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildMetaMessage(judgmentItem.final_body) },
      ],
    });

    if (judgmentItem.update_type === "create") {
      const { error } = await supabase.rpc("create_memory_with_revision", {
        p_user_id: userId,
        p_history_id: historyId,
        p_title: meta.title,
        p_category: (meta.category ?? null) as string,
        p_tags: meta.tags,
        p_summary: meta.summary,
        p_body: judgmentItem.final_body,
      });
      throwIfSupabaseError(error);
    } else {
      if (!judgmentItem.target_id) {
        throw new Error(
          `update_type "${judgmentItem.update_type}" requires non-null target_id`,
        );
      }
      const { error } = await supabase.rpc("update_memory_with_revision", {
        p_memory_id: judgmentItem.target_id,
        p_user_id: userId,
        p_history_id: historyId,
        p_title: meta.title,
        p_category: (meta.category ?? null) as string,
        p_tags: meta.tags,
        p_summary: meta.summary,
        p_body: judgmentItem.final_body,
        p_update_type: judgmentItem.update_type,
      });
      throwIfSupabaseError(error);
    }

    titles.push(meta.title);
  }

  return { titles, historyId };
}

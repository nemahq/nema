import * as Sentry from "@sentry/node";

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
// 실측 기반: body_en으로 인덱싱된 Memory를 한국어 토픽으로 cross-lingual 검색 시 관련 항목이 0.4~0.6 구간에 분포. 0.3은 false-positive를 허용하는 대신 miss를 줄이는 쪽 (JUDGMENT가 무관 후보를 걸러냄)
const VECTOR_SCORE_THRESHOLD = 0.3;

type PipelineStep = "split" | "judgment" | "meta";

async function withStepContext<T>(params: {
  step: PipelineStep;
  extra: Record<string, unknown>;
  run: () => Promise<T>;
}): Promise<T> {
  try {
    return await params.run();
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "saving", step: params.step },
      extra: params.extra,
    });
    throw err;
  }
}

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

  const splitOutput = await withStepContext({
    step: "split",
    extra: { userId, sessionId },
    run: () =>
      llm.mini.generateStructured({
        schema: SplitOutputSchema,
        schemaName: "saving_split",
        systemPrompt: SPLIT_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
      }),
  });

  // 토픽별로 독립 검색 + JUDGMENT 병렬 실행. 최종 persist는 순차라 같은 target 중복 시 late-write-wins (NEM-95)
  const topicResults = await Promise.all(
    splitOutput.topics.map(async (topic, topicIndex) => {
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

      const judgmentOutput = await withStepContext({
        step: "judgment",
        extra: { userId, sessionId, topicIndex },
        run: () =>
          llm.standard.generateStructured({
            schema: JudgmentOutputSchema,
            schemaName: "saving_judgment",
            systemPrompt: JUDGMENT_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: buildJudgmentMessage(topic, candidates),
              },
            ],
          }),
      });

      return judgmentOutput.items;
    }),
  );

  const allItems: JudgmentItem[] = topicResults.flat();

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

  // META LLM은 아이템별 병렬, persist는 원자적 단일 RPC로 all-or-nothing 보장.
  // 같은 memory_id를 여러 아이템이 target으로 지목하면 RPC 내부 순차 loop에서 late-write-wins로 결정적 처리.
  const metas = await Promise.all(
    allItems.map((judgmentItem, itemIndex) =>
      withStepContext({
        step: "meta",
        extra: { userId, sessionId, itemIndex },
        run: () =>
          llm.mini.generateStructured({
            schema: MetaOutputSchema,
            schemaName: "saving_meta",
            systemPrompt: META_SYSTEM_PROMPT,
            messages: [
              {
                role: "user",
                content: buildMetaMessage(judgmentItem.final_body),
              },
            ],
          }),
      }),
    ),
  );

  const pipelineItems = allItems.map((judgmentItem, i) => ({
    update_type: judgmentItem.update_type,
    target_id: judgmentItem.target_id,
    title: metas[i].title,
    category: metas[i].category,
    tags: metas[i].tags,
    summary: metas[i].summary,
    body: judgmentItem.final_body,
  }));

  const { data: titles, error: applyError } = await supabase.rpc(
    "apply_save_pipeline",
    {
      p_user_id: userId,
      p_history_id: historyId,
      p_items: pipelineItems,
    },
  );
  throwIfSupabaseError(applyError);

  return { titles: titles ?? [], historyId };
}

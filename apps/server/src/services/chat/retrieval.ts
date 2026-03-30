import * as Sentry from "@sentry/node";

import type { ChatStreamEvent, Locale } from "@nema-io/shared";

import { t } from "@server/infra/i18n";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildRetrievalMessage,
  RETRIEVAL_SYSTEM_PROMPT,
} from "@server/prompts/retrieval";
import {
  buildSearchQueryMessage,
  SEARCH_QUERY_EXTRACTOR_SYSTEM_PROMPT,
  SearchQuerySchema,
} from "@server/prompts/search-query-extractor";
import { trackEvent } from "@server/services/event-service";

const RETRIEVAL_PER_QUERY_LIMIT = 15;
const RETRIEVAL_MAX_RESULTS = 15;
const RETRIEVAL_SCORE_THRESHOLD = 0.6;
const TEXT_MATCH_LIMIT = 10;

interface RetrievalResult {
  text: string;
  hasResults: boolean;
}

export async function* handleRetrievalStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  question: string;
  lng: Locale;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent, RetrievalResult> {
  const { supabase, providers, userId, sessionId, question, lng, signal } =
    args;
  const { embedding, vectorStore, graphStore } = providers;

  const searchQuery = await providers.llm.mini.generateStructured({
    schema: SearchQuerySchema,
    schemaName: "search_query_extractor",
    systemPrompt: SEARCH_QUERY_EXTRACTOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSearchQueryMessage(question) }],
  });

  yield { type: "phase", name: "searching" };

  // --- 3개 검색 채널 병렬 실행 (개별 채널 실패해도 메인 흐름 유지) ---
  const sentryExtra = { userId, sessionId };

  const [vectorResults, graphResults, textMatchDocIds] = await Promise.all([
    // 1) Qdrant 벡터 검색 (영어 쿼리)
    (searchQuery.queriesEn.length > 0
      ? Promise.all(
          searchQuery.queriesEn.map((query) =>
            vectorStore.search(embedding, {
              userId,
              query,
              limit: RETRIEVAL_PER_QUERY_LIMIT,
              scoreThreshold: RETRIEVAL_SCORE_THRESHOLD,
            }),
          ),
        ).then((batches) => batches.flat())
      : Promise.resolve([] as Awaited<ReturnType<typeof vectorStore.search>>)
    ).catch((err) => {
      Sentry.captureException(err, {
        tags: { component: "retrieval", channel: "vector" },
        extra: sentryExtra,
      });
      return [] as Awaited<ReturnType<typeof vectorStore.search>>;
    }),

    // 2) Neo4j 그래프 검색 (영어 엔티티)
    (searchQuery.entitiesEn.length > 0
      ? graphStore.findDocumentsByEntities({
          entityNames: searchQuery.entitiesEn,
          userId,
          limit: RETRIEVAL_PER_QUERY_LIMIT,
        })
      : Promise.resolve([])
    ).catch((err) => {
      Sentry.captureException(err, {
        tags: { component: "retrieval", channel: "graph" },
        extra: sentryExtra,
      });
      return [] as Array<{ docId: string }>;
    }),

    // 3) Supabase 텍스트 매치 (엔티티 키워드)
    searchTextMatch({
      supabase,
      userId,
      entitiesEn: searchQuery.entitiesEn,
      entities: searchQuery.entities,
    }).catch((err) => {
      Sentry.captureException(err, {
        tags: { component: "retrieval", channel: "text_match" },
        extra: sentryExtra,
      });
      return [] as string[];
    }),
  ]);

  const graphDocIds = new Set(graphResults.map((gr) => gr.docId));
  const textMatchSet = new Set(textMatchDocIds);

  // --- boost: 그래프 + 텍스트 매치 겹침 → 위로 ---
  const boostScore = (docId: string): number =>
    (graphDocIds.has(docId) ? 1 : 0) + (textMatchSet.has(docId) ? 1 : 0);

  const boosted = [...vectorResults].sort((a, b) => {
    const diff = boostScore(b.payload.doc_id) - boostScore(a.payload.doc_id);
    return diff !== 0 ? diff : b.score - a.score;
  });

  // --- dedup + 벡터에 없는 텍스트 매치 결과 뒤에 추가 ---
  const uniqueDocIds: string[] = [];
  const seenDocIds = new Set<string>();
  const scores: number[] = [];
  let graphBoostedCount = 0;
  let textBoostedCount = 0;
  let textOnlyCount = 0;

  for (const vr of boosted) {
    if (uniqueDocIds.length >= RETRIEVAL_MAX_RESULTS) {
      break;
    }
    if (seenDocIds.has(vr.payload.doc_id)) {
      continue;
    }
    seenDocIds.add(vr.payload.doc_id);
    uniqueDocIds.push(vr.payload.doc_id);
    scores.push(vr.score);
    if (graphDocIds.has(vr.payload.doc_id)) {
      graphBoostedCount++;
    }
    if (textMatchSet.has(vr.payload.doc_id)) {
      textBoostedCount++;
    }
  }

  for (const docId of textMatchDocIds) {
    if (uniqueDocIds.length >= RETRIEVAL_MAX_RESULTS) {
      break;
    }
    if (seenDocIds.has(docId)) {
      continue;
    }
    seenDocIds.add(docId);
    uniqueDocIds.push(docId);
    scores.push(0);
    textOnlyCount++;
  }

  let searchResults: Array<{ id: string; title: string; body: string }> = [];

  if (uniqueDocIds.length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, body")
      .in("id", uniqueDocIds);

    throwIfSupabaseError(error);

    const docMap = new Map(
      (data ?? []).map((d) => [d.id, { title: d.title ?? "", body: d.body }]),
    );

    searchResults = uniqueDocIds.flatMap((id) => {
      const doc = docMap.get(id);
      return doc ? [{ id, title: doc.title, body: doc.body }] : [];
    });
  }

  trackEvent({
    supabase,
    userId,
    type: "retrieval.completed",
    sessionId,
    payload: {
      result_count: searchResults.length,
      scores,
      graph_boosted_count: graphBoostedCount,
      text_boosted_count: textBoostedCount,
      text_only_count: textOnlyCount,
      query: question,
    },
  });

  if (searchResults.length === 0) {
    const noResult = t("chat.retrieval_empty", lng);
    yield { type: "token", text: noResult };
    return { text: noResult, hasResults: false };
  }

  yield { type: "retrieval_start" };
  yield { type: "phase", name: "answering" };

  let fullText = "";

  for await (const chunk of providers.llm.standard.generateStream({
    systemPrompt: RETRIEVAL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildRetrievalMessage(question, searchResults),
      },
    ],
    signal,
  })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return { text: fullText, hasResults: true };
}

function sanitizePostgrestValue(value: string): string {
  return value.replace(/[,.()"{}\\]/g, "");
}

async function searchTextMatch(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  entitiesEn: string[];
  entities: string[];
}): Promise<string[]> {
  const { supabase, userId, entitiesEn, entities } = args;
  const conditions: string[] = [];

  for (const e of entitiesEn) {
    const safe = sanitizePostgrestValue(e);
    if (safe.length === 0) {
      continue;
    }
    conditions.push(`tags_en.cs.{${safe}}`);
    conditions.push(`title_en.ilike.%${safe}%`);
    conditions.push(`summary_en.ilike.%${safe}%`);
  }

  for (const e of entities) {
    const safe = sanitizePostgrestValue(e);
    if (safe.length === 0) {
      continue;
    }
    conditions.push(`tags.cs.{${safe}}`);
    conditions.push(`title.ilike.%${safe}%`);
    conditions.push(`summary.ilike.%${safe}%`);
  }

  if (conditions.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("documents")
    .select("id")
    .eq("user_id", userId)
    .or(conditions.join(","))
    .limit(TEXT_MATCH_LIMIT);

  throwIfSupabaseError(error);
  return (data ?? []).map((d) => d.id);
}

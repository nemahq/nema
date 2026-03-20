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

export async function* handleRetrievalStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  question: string;
  lng: Locale;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent, string> {
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

  // --- 3개 검색 채널 병렬 실행 ---
  const [vectorResults, graphResults, textMatchDocIds] = await Promise.all([
    // 1) Qdrant 벡터 검색 (영어 쿼리)
    searchQuery.queries.length > 0
      ? Promise.all(
          searchQuery.queries.map((query) =>
            vectorStore.search(embedding, {
              userId,
              query,
              limit: RETRIEVAL_PER_QUERY_LIMIT,
              scoreThreshold: RETRIEVAL_SCORE_THRESHOLD,
            }),
          ),
        ).then((batches) => batches.flat())
      : Promise.resolve([] as Awaited<ReturnType<typeof vectorStore.search>>),

    // 2) Neo4j 그래프 검색 (영어 엔티티)
    searchQuery.entities.length > 0
      ? graphStore.findDocumentsByEntities({
          entityNames: searchQuery.entities,
          userId,
          limit: RETRIEVAL_PER_QUERY_LIMIT,
        })
      : Promise.resolve([]),

    // 3) Supabase 텍스트 매치 (영어 + 사용자 언어)
    searchTextMatch({ supabase, userId, searchQuery }),
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
    textBoostedCount++;
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
      query: question,
    },
  });

  if (searchResults.length === 0) {
    const noResult = t("chat.retrieval_empty", lng);
    yield { type: "token", text: noResult };
    return noResult;
  }

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

  return fullText;
}

async function searchTextMatch(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  searchQuery: {
    queries: string[];
    entities: string[];
    localQueries: string[];
    localEntities: string[];
  };
}): Promise<string[]> {
  const { supabase, userId, searchQuery } = args;
  const conditions: string[] = [];

  for (const q of searchQuery.queries) {
    conditions.push(`title_en.ilike.%${q}%`);
    conditions.push(`summary_en.ilike.%${q}%`);
  }

  for (const q of searchQuery.localQueries) {
    conditions.push(`title.ilike.%${q}%`);
    conditions.push(`summary.ilike.%${q}%`);
  }

  for (const e of searchQuery.entities) {
    conditions.push(`tags_en.cs.{${e}}`);
  }

  for (const e of searchQuery.localEntities) {
    conditions.push(`tags.cs.{${e}}`);
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

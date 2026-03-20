import type { ChatStreamEvent, Locale } from "@nema-io/shared";

import { t } from "@server/infra/i18n";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
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

  let vectorResults: Awaited<ReturnType<typeof vectorStore.search>> = [];
  if (searchQuery.queries.length > 0) {
    const searchBatches = await Promise.all(
      searchQuery.queries.map((query) =>
        vectorStore.search(embedding, {
          userId,
          query,
          limit: RETRIEVAL_PER_QUERY_LIMIT,
          scoreThreshold: RETRIEVAL_SCORE_THRESHOLD,
        }),
      ),
    );
    vectorResults = searchBatches.flat();
  }

  const graphDocIds = new Set<string>();
  if (searchQuery.entities.length > 0) {
    const graphResults = await graphStore.findDocumentsByEntities({
      entityNames: searchQuery.entities,
      userId,
      limit: RETRIEVAL_PER_QUERY_LIMIT,
    });
    for (const gr of graphResults) {
      graphDocIds.add(gr.docId);
    }
  }

  const seenDocIds = new Set<string>();
  const searchResults: Array<{ id: string; title: string; body: string }> = [];
  const scores: number[] = [];
  let graphBoostedCount = 0;

  const graphBoosted = [...vectorResults].sort((a, b) => {
    const aBoost = graphDocIds.has(a.payload.doc_id) ? 1 : 0;
    const bBoost = graphDocIds.has(b.payload.doc_id) ? 1 : 0;
    return bBoost - aBoost || b.score - a.score;
  });

  for (const vr of graphBoosted) {
    if (searchResults.length >= RETRIEVAL_MAX_RESULTS) {
      break;
    }
    if (!seenDocIds.has(vr.payload.doc_id)) {
      seenDocIds.add(vr.payload.doc_id);
      scores.push(vr.score);
      if (graphDocIds.has(vr.payload.doc_id)) {
        graphBoostedCount++;
      }
      searchResults.push({
        id: vr.payload.doc_id,
        title: vr.payload.summary,
        body: vr.payload.text,
      });
    }
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

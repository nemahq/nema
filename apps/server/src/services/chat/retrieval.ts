import type { ChatStreamEvent, Locale } from "@nema-io/shared";

import { t } from "@server/infra/i18n";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  buildRetrievalMessage,
  RETRIEVAL_SYSTEM_PROMPT,
} from "@server/prompts/retrieval";
import { trackEvent } from "@server/services/event-service";

const RETRIEVAL_SEARCH_LIMIT = 5;

interface SearchIntent {
  queries: string[] | null;
  entities: string[] | null;
}

export async function* handleRetrievalStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  question: string;
  intent: SearchIntent;
  lng: Locale;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent, string> {
  const {
    supabase,
    providers,
    userId,
    sessionId,
    question,
    intent,
    lng,
    signal,
  } = args;
  const { embedding, vectorStore, graphStore } = providers;

  let vectorResults: Awaited<ReturnType<typeof vectorStore.search>> = [];
  if (intent.queries) {
    const searchBatches = await Promise.all(
      intent.queries.map((query) =>
        vectorStore.search(embedding, {
          userId,
          query,
          limit: RETRIEVAL_SEARCH_LIMIT,
        }),
      ),
    );
    vectorResults = searchBatches.flat();
  }

  const graphDocIds = new Set<string>();
  if (intent.entities && intent.entities.length > 0) {
    const graphResults = await graphStore.findDocumentsByEntities({
      entityNames: intent.entities,
      userId,
      limit: RETRIEVAL_SEARCH_LIMIT,
    });
    for (const gr of graphResults) {
      graphDocIds.add(gr.docId);
    }
  }

  const seenDocIds = new Set<string>();
  const searchResults: Array<{ id: string; title: string; body: string }> = [];

  const graphBoosted = [...vectorResults].sort((a, b) => {
    const aBoost = graphDocIds.has(a.payload.doc_id) ? 1 : 0;
    const bBoost = graphDocIds.has(b.payload.doc_id) ? 1 : 0;
    return bBoost - aBoost || b.score - a.score;
  });

  for (const vr of graphBoosted) {
    if (!seenDocIds.has(vr.payload.doc_id)) {
      seenDocIds.add(vr.payload.doc_id);
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
    payload: { result_count: searchResults.length },
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

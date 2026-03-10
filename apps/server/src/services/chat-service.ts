import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatInput, Message } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import { SupabaseError } from "@server/infra/supabase-error";
// TODO: 드래프팅 연동 시 주석 해제
// import { DraftOutputSchema } from "@nema-io/shared";
// import {
//   PHASE1_SYSTEM_PROMPT,
//   buildFirstCallMessage,
// } from "@server/prompts/drafting";
import {
  buildIntentRouterMessage,
  INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
} from "@server/prompts/intent-router";
import {
  buildRetrievalMessage,
  RETRIEVAL_SYSTEM_PROMPT,
} from "@server/prompts/retrieval";

const IntentOutputSchema = z.object({
  intent: z.enum(["put-in", "pull-out"]),
  queries: z.array(z.string()).nullable(),
  entities: z.array(z.string()).nullable(),
});

const RetrievalOutputSchema = z.object({
  answer: z.string(),
  source_ids: z.array(z.string()),
});

export async function processChat(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  input: ChatInput,
): Promise<Message> {
  const intentResult = await providers.llm.generateStructured({
    schema: IntentOutputSchema,
    schemaName: "intent_router",
    systemPrompt: INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildIntentRouterMessage(input.content) },
    ],
  });

  let responseContent: string;

  if (intentResult.intent === "pull-out") {
    responseContent = await handleRetrieval(
      providers,
      userId,
      input.content,
      intentResult,
    );
  } else {
    // TODO: 드래프팅 결과를 assistant 메시지로 반환하도록 전환
    // const draftResult = await providers.llm.generateStructured({
    //   schema: DraftOutputSchema,
    //   schemaName: "drafting",
    //   systemPrompt: PHASE1_SYSTEM_PROMPT,
    //   messages: [
    //     { role: "user", content: buildFirstCallMessage(input.content) },
    //   ],
    // });
    // responseContent = draftResult.body;
    responseContent = `입력하신 내용을 정리했습니다:\n\n${input.content}`;
  }

  const message: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: responseContent,
    createdAt: new Date().toISOString(),
  };

  const { error } = await supabase.rpc("append_message", {
    p_session_id: input.sessionId,
    p_message: message,
  });

  if (error) {
    throw new SupabaseError(
      error.code === "P0002" ? "not_found" : "query_failed",
      error.message,
      error,
    );
  }

  return message;
}

async function handleRetrieval(
  providers: Providers,
  userId: string,
  question: string,
  intent: z.infer<typeof IntentOutputSchema>,
): Promise<string> {
  const { llm, embedding, vectorStore, graphStore } = providers;

  const vectorResults = [];
  if (intent.queries) {
    for (const query of intent.queries) {
      const results = await vectorStore.search(embedding, {
        userId,
        query,
        limit: 5,
      });
      vectorResults.push(...results);
    }
  }

  const graphDocIds = new Set<string>();
  if (intent.entities && intent.entities.length > 0) {
    const graphResults = await graphStore.findDocumentsByEntities({
      entityNames: intent.entities,
      userId,
      limit: 5,
    });
    for (const gr of graphResults) {
      graphDocIds.add(gr.docId);
    }
  }

  const seenDocIds = new Set<string>();
  const searchResults: Array<{ id: string; title: string; body: string }> = [];

  const graphBoosted = vectorResults.sort((a, b) => {
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

  if (searchResults.length === 0) {
    return "관련된 정보를 찾지 못했습니다.";
  }

  const retrievalResult = await llm.generateStructured({
    schema: RetrievalOutputSchema,
    schemaName: "retrieval",
    systemPrompt: RETRIEVAL_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: buildRetrievalMessage(question, searchResults),
      },
    ],
  });

  return retrievalResult.answer;
}

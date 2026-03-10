import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatInput, Message } from "@nema-io/shared";
import { DraftOutputSchema } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import {
  SupabaseError,
  toSupabaseErrorCode,
} from "@server/infra/supabase-error";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  PHASE1_SYSTEM_PROMPT,
} from "@server/prompts/drafting";
import {
  buildEntityExtractionMessage,
  ENTITY_EXTRACTION_SYSTEM_PROMPT,
  EntityExtractionSchema,
} from "@server/prompts/entity-extraction";
import {
  buildIntentRouterMessage,
  INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
  INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
} from "@server/prompts/intent-router";
import {
  buildRetrievalMessage,
  RETRIEVAL_SYSTEM_PROMPT,
} from "@server/prompts/retrieval";
import {
  buildJudgmentMessage,
  buildMetaMessage,
  buildSplitMessage,
  JUDGMENT_SYSTEM_PROMPT,
  META_SYSTEM_PROMPT,
  SPLIT_SYSTEM_PROMPT,
} from "@server/prompts/saving";

// --- Internal schemas ---

const InactiveIntentSchema = z.object({
  intent: z.enum(["put-in", "pull-out"]),
  queries: z.array(z.string()).nullable(),
  entities: z.array(z.string()).nullable(),
});

const ActiveIntentSchema = z.object({
  intent: z.enum(["edit", "pull-out", "save", "cancel"]),
  queries: z.array(z.string()).nullable(),
  entities: z.array(z.string()).nullable(),
});

const RetrievalOutputSchema = z.object({
  answer: z.string(),
  source_ids: z.array(z.string()),
});

const SplitOutputSchema = z.object({
  documents: z.array(z.object({ body: z.string() })),
});

const JudgmentOutputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    target_id: z.null(),
    final_body: z.string(),
  }),
  z.object({
    action: z.literal("update"),
    target_id: z.string().min(1),
    final_body: z.string(),
  }),
]);

const MetaOutputSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  summary: z.string(),
});

interface SearchIntent {
  queries: string[] | null;
  entities: string[] | null;
}

interface Draft {
  body: string;
}

// --- Draft state management ---

async function getDraft(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Draft | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("draft")
    .eq("id", sessionId)
    .single();

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }

  return data.draft as Draft | null;
}

async function setDraft(
  supabase: SupabaseClient,
  sessionId: string,
  body: string,
): Promise<void> {
  const draft: Draft = { body };
  const { error } = await supabase
    .from("sessions")
    .update({ draft })
    .eq("id", sessionId);

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }
}

async function clearDraft(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ draft: null })
    .eq("id", sessionId);

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }
}

async function updateSessionTitle(
  supabase: SupabaseClient,
  sessionId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }
}

// --- Helpers ---

async function appendMessage(
  supabase: SupabaseClient,
  sessionId: string,
  message: Message,
): Promise<void> {
  const { error } = await supabase.rpc("append_message", {
    p_session_id: sessionId,
    p_message: message,
  });

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }
}

async function getExistingTags(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("documents").select("tags");

  if (error) {
    throw new SupabaseError(
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }

  const allTags = new Set<string>();
  for (const doc of data ?? []) {
    for (const tag of (doc.tags as string[]) ?? []) {
      allTags.add(tag);
    }
  }
  return [...allTags];
}

// --- Main entry point ---

export async function processChat(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  input: ChatInput,
): Promise<Message> {
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content: input.content,
    createdAt: new Date().toISOString(),
  };

  await appendMessage(supabase, input.sessionId, userMessage);

  const draft = await getDraft(supabase, input.sessionId);
  let responseContent: string;

  if (draft === null) {
    const intentResult = await providers.llm.generateStructured({
      schema: InactiveIntentSchema,
      schemaName: "intent_router_inactive",
      systemPrompt: INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildIntentRouterMessage(input.content) },
      ],
    });

    if (intentResult.intent === "pull-out") {
      responseContent = await handleRetrieval(
        providers,
        userId,
        input.content,
        intentResult,
      );
    } else {
      responseContent = await handleDrafting(
        supabase,
        providers,
        input.sessionId,
        input.content,
        null,
      );
    }
  } else {
    const intentResult = await providers.llm.generateStructured({
      schema: ActiveIntentSchema,
      schemaName: "intent_router_active",
      systemPrompt: INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildIntentRouterMessage(input.content) },
      ],
    });

    switch (intentResult.intent) {
      case "pull-out":
        responseContent = await handleRetrieval(
          providers,
          userId,
          input.content,
          intentResult,
        );
        break;
      case "edit":
        responseContent = await handleDrafting(
          supabase,
          providers,
          input.sessionId,
          input.content,
          draft,
        );
        break;
      case "save":
        responseContent = await handleSave(
          supabase,
          providers,
          userId,
          input.sessionId,
          draft.body,
        );
        break;
      case "cancel":
        await clearDraft(supabase, input.sessionId);
        responseContent = "작성 중인 내용이 취소되었습니다.";
        break;
    }
  }

  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: responseContent,
    createdAt: new Date().toISOString(),
  };

  await appendMessage(supabase, input.sessionId, assistantMessage);

  return assistantMessage;
}

// --- Drafting ---

async function handleDrafting(
  supabase: SupabaseClient,
  providers: Providers,
  sessionId: string,
  userInput: string,
  currentDraft: Draft | null,
): Promise<string> {
  const isFirstCall = currentDraft === null;
  const message = isFirstCall
    ? buildFirstCallMessage(userInput)
    : buildEditCycleMessage(currentDraft.body, userInput);

  const result = await providers.llm.generateStructured({
    schema: DraftOutputSchema,
    schemaName: "drafting",
    systemPrompt: PHASE1_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
  });

  await setDraft(supabase, sessionId, result.body);

  if (result.session_title) {
    await updateSessionTitle(supabase, sessionId, result.session_title);
  }

  return result.body;
}

// --- Retrieval ---

async function handleRetrieval(
  providers: Providers,
  userId: string,
  question: string,
  intent: SearchIntent,
): Promise<string> {
  const { llm, embedding, vectorStore, graphStore } = providers;

  let vectorResults: Awaited<ReturnType<typeof vectorStore.search>> = [];
  if (intent.queries) {
    const results = await Promise.all(
      intent.queries.map((query) =>
        vectorStore.search(embedding, { userId, query, limit: 5 }),
      ),
    );
    vectorResults = results.flat();
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

// --- Save pipeline ---

async function handleSave(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  sessionId: string,
  draftBody: string,
): Promise<string> {
  const { llm } = providers;

  const splitResult = await llm.generateStructured({
    schema: SplitOutputSchema,
    schemaName: "split",
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
  });

  const existingTags = await getExistingTags(supabase);

  const savedDocs: Array<{ id: string; title: string }> = [];
  for (const doc of splitResult.documents) {
    const results = await saveDocument(
      supabase,
      providers,
      userId,
      sessionId,
      doc.body,
      existingTags,
    );
    savedDocs.push(...results);
  }

  await clearDraft(supabase, sessionId);

  const docList = savedDocs.map((d) => `- ${d.title}`).join("\n");
  return `저장이 완료되었습니다.\n\n${docList}`;
}

async function saveDocument(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  sessionId: string,
  body: string,
  existingTags: string[],
): Promise<Array<{ id: string; title: string }>> {
  const { llm, embedding, vectorStore } = providers;

  const searchResults = await vectorStore.search(embedding, {
    userId,
    query: body,
    limit: 5,
  });

  const docIds = [...new Set(searchResults.map((r) => r.payload.doc_id))];
  let similarDocs: Array<{ id: string; title: string; body: string }> = [];

  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, body")
      .in("id", docIds);

    if (error) {
      throw new SupabaseError(
        toSupabaseErrorCode(error.code),
        error.message,
        error,
      );
    }

    similarDocs = (data ?? []).map((d) => ({
      id: d.id as string,
      title: (d.title as string) ?? "",
      body: d.body as string,
    }));
  }

  const judgment = await llm.generateStructured({
    schema: JudgmentOutputSchema,
    schemaName: "judgment",
    systemPrompt: JUDGMENT_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildJudgmentMessage(body, similarDocs) },
    ],
  });

  if (judgment.action === "update") {
    const reSplitResult = await llm.generateStructured({
      schema: SplitOutputSchema,
      schemaName: "split",
      systemPrompt: SPLIT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildSplitMessage(judgment.final_body) },
      ],
    });

    if (reSplitResult.documents.length > 1) {
      await deleteDocument(supabase, providers, judgment.target_id);

      const results: Array<{ id: string; title: string }> = [];
      for (const splitDoc of reSplitResult.documents) {
        const result = await persistDocument(
          supabase,
          providers,
          userId,
          sessionId,
          "create",
          null,
          splitDoc.body,
          existingTags,
        );
        results.push(result);
      }
      return results;
    }

    return [
      await persistDocument(
        supabase,
        providers,
        userId,
        sessionId,
        "update",
        judgment.target_id,
        judgment.final_body,
        existingTags,
      ),
    ];
  }

  return [
    await persistDocument(
      supabase,
      providers,
      userId,
      sessionId,
      "create",
      null,
      judgment.final_body,
      existingTags,
    ),
  ];
}

async function persistDocument(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  sessionId: string,
  action: "create" | "update",
  targetId: string | null,
  body: string,
  existingTags: string[],
): Promise<{ id: string; title: string }> {
  const { llm, embedding, vectorStore, graphStore } = providers;

  const [meta, entityResult] = await Promise.all([
    llm.generateStructured({
      schema: MetaOutputSchema,
      schemaName: "meta",
      systemPrompt: META_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildMetaMessage(body, existingTags) },
      ],
    }),
    llm.generateStructured({
      schema: EntityExtractionSchema,
      schemaName: "entity_extraction",
      systemPrompt: ENTITY_EXTRACTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildEntityExtractionMessage(body) }],
    }),
  ]);

  let docId: string;

  if (action === "create") {
    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: userId,
        title: meta.title,
        tags: meta.tags,
        summary: meta.summary,
        body,
        ingestion_status: "completed",
      })
      .select("id")
      .single();

    if (error) {
      throw new SupabaseError(
        toSupabaseErrorCode(error.code),
        error.message,
        error,
      );
    }

    docId = data.id as string;
  } else {
    docId = targetId as string;

    const { error } = await supabase
      .from("documents")
      .update({
        title: meta.title,
        tags: meta.tags,
        summary: meta.summary,
        body,
      })
      .eq("id", docId);

    if (error) {
      throw new SupabaseError(
        toSupabaseErrorCode(error.code),
        error.message,
        error,
      );
    }

    await Promise.all([
      vectorStore.deleteByDocument(docId),
      graphStore.deleteByDocument(docId),
    ]);
  }

  await Promise.all([
    vectorStore.upsert(embedding, {
      docId,
      userId,
      chunks: [body],
      tags: meta.tags,
      summary: meta.summary,
    }),
    graphStore.upsertEntities({
      docId,
      userId,
      entities: entityResult.entities,
    }),
    supabase
      .from("session_documents")
      .upsert({ session_id: sessionId, document_id: docId })
      .then(({ error }) => {
        if (error)
          throw new SupabaseError(
            toSupabaseErrorCode(error.code),
            error.message,
            error,
          );
      }),
  ]);

  return { id: docId, title: meta.title };
}

async function deleteDocument(
  supabase: SupabaseClient,
  providers: Providers,
  docId: string,
): Promise<void> {
  await Promise.all([
    supabase
      .from("documents")
      .delete()
      .eq("id", docId)
      .then(({ error }) => {
        if (error)
          throw new SupabaseError(
            toSupabaseErrorCode(error.code),
            error.message,
            error,
          );
      }),
    providers.vectorStore.deleteByDocument(docId),
    providers.graphStore.deleteByDocument(docId),
  ]);
}

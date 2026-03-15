import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

import type {
  ChatInput,
  ChatStreamEvent,
  Locale,
  Message,
  MessageType,
  SessionDraft,
} from "@nema-io/shared";
import {
  MessageSchema,
  SessionDraftSchema,
  STATUS_LOG_TYPES,
} from "@nema-io/shared";

import { t } from "@server/infra/i18n";
import type { Providers } from "@server/infra/providers";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";
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
import { trackEvent } from "@server/services/event-service";

const SIMILAR_DOC_SEARCH_LIMIT = 5;

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

const SplitOutputSchema = z.object({
  documents: z.array(z.object({ body: z.string().min(1) })).min(1),
});

const JudgmentOutputSchema = z
  .object({
    action: z.enum(["create", "update"]),
    target_id: z.string().nullable(),
    final_body: z.string().min(1),
  })
  .refine(
    (d) =>
      d.action !== "update" || (d.target_id !== null && d.target_id.length > 0),
    { message: "target_id required for update" },
  );

const MetaOutputSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

type Draft = SessionDraft;

interface SearchIntent {
  queries: string[] | null;
  entities: string[] | null;
}

type PersistAction =
  | { action: "create" }
  | { action: "update"; targetId: string };

interface ServiceContext {
  supabase: SupabaseClient;
  providers: Providers;
  userId: string;
}

async function getDraft(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Draft | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("draft")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  return data.draft ? SessionDraftSchema.parse(data.draft) : null;
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

  throwIfSupabaseError(error);
}

async function clearDraft(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ draft: null })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
}

async function appendMessage(
  supabase: SupabaseClient,
  sessionId: string,
  message: Message,
): Promise<void> {
  const { error } = await supabase.rpc("append_message", {
    p_session_id: sessionId,
    p_message: message,
  });

  throwIfSupabaseError(error);
}

async function getExistingTags(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("tags")
    .eq("user_id", userId);

  throwIfSupabaseError(error);

  const allTags = new Set<string>();
  for (const doc of data ?? []) {
    const tags = Array.isArray(doc.tags) ? doc.tags : [];
    for (const tag of tags) {
      if (typeof tag === "string") {
        allTags.add(tag);
      }
    }
  }
  return [...allTags];
}

interface ChatResponse {
  message: Message;
  draft: Draft | null;
}

async function createAssistantResponse(args: {
  supabase: SupabaseClient;
  sessionId: string;
  type: MessageType;
  content: string;
}): Promise<ChatResponse> {
  const message = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: args.type,
    content: args.content,
    createdAt: new Date().toISOString(),
  });
  await appendMessage(args.supabase, args.sessionId, message);
  return { message, draft: null };
}

export async function* processChatStream(args: {
  supabase: SupabaseClient;
  providers: Providers;
  userId: string;
  input: ChatInput;
  lng: Locale;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const { supabase, providers, userId, input, lng, signal } = args;

  const userMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content: input.content,
    createdAt: new Date().toISOString(),
  });

  await appendMessage(supabase, input.sessionId, userMessage);

  const draft = await getDraft(supabase, input.sessionId);

  let responseContent: string;
  let messageType: MessageType = "text";

  if (draft === null) {
    const intentResult = await providers.llm.generateStructured({
      schema: InactiveIntentSchema,
      schemaName: "intent_router_inactive",
      systemPrompt: INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildIntentRouterMessage(input.content) },
      ],
    });

    trackEvent(supabase, userId, "intent.classified", input.sessionId, {
      intent: intentResult.intent,
    });

    if (intentResult.intent === "pull-out") {
      responseContent = yield* handleRetrievalStream({
        supabase,
        providers,
        userId,
        sessionId: input.sessionId,
        question: input.content,
        intent: intentResult,
        lng,
        signal,
      });
    } else {
      yield { type: "draft_start" };
      const draftBody = yield* handleDraftingStream({
        providers,
        userInput: input.content,
        currentDraft: null,
        signal,
      });
      await setDraft(supabase, input.sessionId, draftBody);
      responseContent = STATUS_LOG_TYPES.DRAFT_CREATED;
      messageType = "status";
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

    trackEvent(supabase, userId, "intent.classified", input.sessionId, {
      intent: intentResult.intent,
    });

    switch (intentResult.intent) {
      case "pull-out":
        responseContent = yield* handleRetrievalStream({
          supabase,
          providers,
          userId,
          sessionId: input.sessionId,
          question: input.content,
          intent: intentResult,
          lng,
          signal,
        });
        break;
      case "edit": {
        yield { type: "draft_start" };
        const editedBody = yield* handleDraftingStream({
          providers,
          userInput: input.content,
          currentDraft: draft,
          signal,
        });
        await setDraft(supabase, input.sessionId, editedBody);
        responseContent = STATUS_LOG_TYPES.DRAFT_EDITED;
        messageType = "status";
        break;
      }
      case "save":
        await handleSave({
          supabase,
          providers,
          userId,
          sessionId: input.sessionId,
          draftBody: draft.body,
        });
        responseContent = STATUS_LOG_TYPES.DRAFT_SAVED;
        messageType = "status";
        break;
      case "cancel":
        await clearDraft(supabase, input.sessionId);
        responseContent = STATUS_LOG_TYPES.DRAFT_CANCELLED;
        messageType = "status";
        break;
      default: {
        const _exhaustive: never = intentResult.intent;
        throw new Error(`Unhandled intent: ${_exhaustive}`);
      }
    }
  }

  const assistantMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: messageType,
    content: responseContent,
    createdAt: new Date().toISOString(),
  });

  await appendMessage(supabase, input.sessionId, assistantMessage);

  yield { type: "done" };
}

export async function saveDraftAction(args: {
  supabase: SupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
}): Promise<ChatResponse> {
  const { supabase, providers, userId, sessionId } = args;

  const draft = await getDraft(supabase, sessionId);
  if (!draft) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active draft to save",
    });
  }

  await handleSave({
    supabase,
    providers,
    userId,
    sessionId,
    draftBody: draft.body,
  });

  return createAssistantResponse({
    supabase,
    sessionId,
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_SAVED,
  });
}

export async function cancelDraftAction(args: {
  supabase: SupabaseClient;
  sessionId: string;
}): Promise<ChatResponse> {
  const { supabase, sessionId } = args;

  await clearDraft(supabase, sessionId);

  return createAssistantResponse({
    supabase,
    sessionId,
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_CANCELLED,
  });
}

async function* handleDraftingStream(args: {
  providers: Providers;
  userInput: string;
  currentDraft: Draft | null;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent, string> {
  const { providers, userInput, currentDraft, signal } = args;

  const isFirstCall = currentDraft === null;
  const message = isFirstCall
    ? buildFirstCallMessage(userInput)
    : buildEditCycleMessage(currentDraft.body, userInput);

  let fullText = "";

  for await (const chunk of providers.llm.generateStream({
    systemPrompt: DRAFTING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    signal,
  })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return fullText;
}

async function* handleRetrievalStream(args: {
  supabase: SupabaseClient;
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
  const { llm, embedding, vectorStore, graphStore } = providers;

  let vectorResults: Awaited<ReturnType<typeof vectorStore.search>> = [];
  if (intent.queries) {
    const results = await Promise.all(
      intent.queries.map((query) =>
        vectorStore.search(embedding, {
          userId,
          query,
          limit: SIMILAR_DOC_SEARCH_LIMIT,
        }),
      ),
    );
    vectorResults = results.flat();
  }

  const graphDocIds = new Set<string>();
  if (intent.entities && intent.entities.length > 0) {
    const graphResults = await graphStore.findDocumentsByEntities({
      entityNames: intent.entities,
      userId,
      limit: SIMILAR_DOC_SEARCH_LIMIT,
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

  trackEvent(supabase, userId, "retrieval.completed", sessionId, {
    result_count: searchResults.length,
  });

  if (searchResults.length === 0) {
    const noResult = t("chat.retrieval_empty", lng);
    yield { type: "token", text: noResult };
    return noResult;
  }

  let fullText = "";

  for await (const chunk of llm.generateStream({
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

async function handleSave(args: {
  supabase: SupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  draftBody: string;
}): Promise<void> {
  const { supabase, providers, userId, sessionId, draftBody } = args;
  const { llm } = providers;

  const splitResult = await llm.generateStructured({
    schema: SplitOutputSchema,
    schemaName: "split",
    systemPrompt: SPLIT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSplitMessage(draftBody) }],
  });

  const existingTags = await getExistingTags(supabase, userId);

  const savedDocs: Array<{ id: string; title: string }> = [];
  for (const doc of splitResult.documents) {
    const results = await saveDocument({
      ctx: { supabase, providers, userId },
      sessionId,
      body: doc.body,
      existingTags,
    });
    savedDocs.push(...results);
  }

  await clearDraft(supabase, sessionId);

  trackEvent(supabase, userId, "document.saved", sessionId, {
    doc_count: savedDocs.length,
  });
}

async function saveDocument(args: {
  ctx: ServiceContext;
  sessionId: string;
  body: string;
  existingTags: string[];
}): Promise<Array<{ id: string; title: string }>> {
  const { ctx, sessionId, body, existingTags } = args;
  const { supabase, providers } = ctx;
  const { llm, embedding, vectorStore } = providers;

  const searchResults = await vectorStore.search(embedding, {
    userId: ctx.userId,
    query: body,
    limit: SIMILAR_DOC_SEARCH_LIMIT,
  });

  const docIds = [...new Set(searchResults.map((r) => r.payload.doc_id))];
  let similarDocs: Array<{ id: string; title: string; body: string }> = [];

  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from("documents")
      .select("id, title, body")
      .in("id", docIds);

    throwIfSupabaseError(error);

    similarDocs = (data ?? []).map((d) => ({
      id: String(d.id),
      title: String(d.title ?? ""),
      body: String(d.body),
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
    if (!judgment.target_id) {
      throw new Error("target_id is required for update action");
    }
    const targetId = judgment.target_id;

    const reSplitResult = await llm.generateStructured({
      schema: SplitOutputSchema,
      schemaName: "split",
      systemPrompt: SPLIT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildSplitMessage(judgment.final_body) },
      ],
    });

    if (reSplitResult.documents.length > 1) {
      const results: Array<{ id: string; title: string }> = [];
      for (const splitDoc of reSplitResult.documents) {
        const result = await persistDocument({
          ctx,
          sessionId,
          persistAction: { action: "create" },
          body: splitDoc.body,
          existingTags,
        });
        results.push(result);
      }
      await deleteDocument(supabase, ctx.userId, targetId);
      return results;
    }

    return [
      await persistDocument({
        ctx,
        sessionId,
        persistAction: { action: "update", targetId },
        body: judgment.final_body,
        existingTags,
      }),
    ];
  }

  return [
    await persistDocument({
      ctx,
      sessionId,
      persistAction: { action: "create" },
      body: judgment.final_body,
      existingTags,
    }),
  ];
}

async function persistDocument(args: {
  ctx: ServiceContext;
  sessionId: string;
  persistAction: PersistAction;
  body: string;
  existingTags: string[];
}): Promise<{ id: string; title: string }> {
  const { ctx, sessionId, persistAction, body, existingTags } = args;
  const { supabase } = ctx;
  const { llm } = ctx.providers;

  const meta = await llm.generateStructured({
    schema: MetaOutputSchema,
    schemaName: "meta",
    systemPrompt: META_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildMetaMessage(body, existingTags) }],
  });

  let docId: string;

  if (persistAction.action === "create") {
    const { data, error } = await supabase.rpc("create_document_with_event", {
      p_user_id: ctx.userId,
      p_title: meta.title,
      p_tags: meta.tags,
      p_summary: meta.summary,
      p_body: body,
      p_session_id: sessionId,
    });

    throwIfSupabaseError(error);

    if (typeof data !== "string") {
      throw new Error("create_document_with_event did not return a string id");
    }
    docId = data;
  } else {
    docId = persistAction.targetId;

    const { error } = await supabase.rpc("update_document_with_event", {
      p_doc_id: docId,
      p_user_id: ctx.userId,
      p_title: meta.title,
      p_tags: meta.tags,
      p_summary: meta.summary,
      p_body: body,
    });

    throwIfSupabaseError(error);
  }

  return { id: docId, title: meta.title };
}

async function deleteDocument(
  supabase: SupabaseClient,
  userId: string,
  docId: string,
): Promise<void> {
  const { error } = await supabase.rpc("delete_document_with_event", {
    p_doc_id: docId,
    p_user_id: userId,
  });

  throwIfSupabaseError(error);
}

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ChatInput, ChatStreamEvent, Message } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  STREAMING_DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";
import {
  buildIntentRouterMessage,
  INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
  INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
} from "@server/prompts/intent-router";
import {
  buildRetrievalMessage,
  STREAMING_RETRIEVAL_SYSTEM_PROMPT,
} from "@server/prompts/retrieval";
import {
  buildJudgmentMessage,
  buildMetaMessage,
  buildSplitMessage,
  JUDGMENT_SYSTEM_PROMPT,
  META_SYSTEM_PROMPT,
  SPLIT_SYSTEM_PROMPT,
} from "@server/prompts/saving";
import {
  buildSessionTitleMessage,
  SESSION_TITLE_SYSTEM_PROMPT,
  SessionTitleSchema,
} from "@server/prompts/session-title";
import { trackEvent } from "@server/services/event-service";

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

const DraftSchema = z.object({ body: z.string().min(1) });
type Draft = z.infer<typeof DraftSchema>;

interface SearchIntent {
  queries: string[] | null;
  entities: string[] | null;
}

type PersistAction =
  | { action: "create" }
  | { action: "update"; targetId: string };

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

  throwIfSupabaseError(error);

  return data.draft ? DraftSchema.parse(data.draft) : null;
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

async function updateSessionTitle(
  supabase: SupabaseClient,
  sessionId: string,
  title: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
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
    for (const tag of (doc.tags as string[]) ?? []) {
      allTags.add(tag);
    }
  }
  return [...allTags];
}

async function needsSessionTitle(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("sessions")
    .select("title")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  return data.title === null;
}

async function generateSessionTitle(
  supabase: SupabaseClient,
  providers: Providers,
  sessionId: string,
  userInput: string,
): Promise<string | null> {
  try {
    const result = await providers.llm.generateStructured({
      schema: SessionTitleSchema,
      schemaName: "session_title",
      systemPrompt: SESSION_TITLE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildSessionTitleMessage(userInput) },
      ],
    });

    await updateSessionTitle(supabase, sessionId, result.session_title);
    return result.session_title;
  } catch {
    return null;
  }
}

// --- Main entry point ---

export async function* processChatStream(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  input: ChatInput,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content: input.content,
    createdAt: new Date().toISOString(),
  };

  await appendMessage(supabase, input.sessionId, userMessage);

  const [draft, shouldGenerateTitle] = await Promise.all([
    getDraft(supabase, input.sessionId),
    needsSessionTitle(supabase, input.sessionId),
  ]);

  // 첫 메시지면 session_title 병렬 생성
  const titlePromise = shouldGenerateTitle
    ? generateSessionTitle(supabase, providers, input.sessionId, input.content)
    : null;

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

    trackEvent(supabase, userId, "intent.classified", input.sessionId, {
      intent: intentResult.intent,
    });

    if (intentResult.intent === "pull-out") {
      responseContent = yield* handleRetrievalStream(
        supabase,
        providers,
        userId,
        input.sessionId,
        input.content,
        intentResult,
        signal,
      );
    } else {
      responseContent = yield* handleDraftingStream(
        providers,
        input.sessionId,
        input.content,
        null,
        signal,
      );
      await setDraft(supabase, input.sessionId, responseContent);
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
        responseContent = yield* handleRetrievalStream(
          supabase,
          providers,
          userId,
          input.sessionId,
          input.content,
          intentResult,
          signal,
        );
        break;
      case "edit":
        responseContent = yield* handleDraftingStream(
          providers,
          input.sessionId,
          input.content,
          draft,
          signal,
        );
        await setDraft(supabase, input.sessionId, responseContent);
        break;
      case "save":
        responseContent = await handleSave(
          supabase,
          providers,
          userId,
          input.sessionId,
          draft.body,
        );
        yield { type: "token", text: responseContent };
        break;
      case "cancel":
        await clearDraft(supabase, input.sessionId);
        responseContent = "작성 중인 내용이 취소되었습니다.";
        yield { type: "token", text: responseContent };
        break;
      default: {
        const _exhaustive: never = intentResult.intent;
        throw new Error(`Unhandled intent: ${_exhaustive}`);
      }
    }
  }

  // session_title 병렬 호출 결과 수신 + yield
  if (titlePromise) {
    const title = await titlePromise;
    if (title) {
      yield { type: "title", title };
    }
  }

  // 스트림 완료 후 어시스턴트 메시지 저장
  const assistantMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: responseContent,
    createdAt: new Date().toISOString(),
  };

  await appendMessage(supabase, input.sessionId, assistantMessage);

  yield { type: "done" };
}

// --- Streaming drafting ---

async function* handleDraftingStream(
  providers: Providers,
  _sessionId: string,
  userInput: string,
  currentDraft: Draft | null,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, string> {
  const isFirstCall = currentDraft === null;
  const message = isFirstCall
    ? buildFirstCallMessage(userInput)
    : buildEditCycleMessage(currentDraft.body, userInput);

  let fullText = "";

  for await (const chunk of providers.llm.generateStream({
    systemPrompt: STREAMING_DRAFTING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    signal,
  })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return fullText;
}

// --- Streaming retrieval ---

async function* handleRetrievalStream(
  supabase: SupabaseClient,
  providers: Providers,
  userId: string,
  sessionId: string,
  question: string,
  intent: SearchIntent,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, string> {
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

  trackEvent(supabase, userId, "retrieval.completed", sessionId, {
    result_count: searchResults.length,
  });

  if (searchResults.length === 0) {
    const noResult = "관련된 정보를 찾지 못했습니다.";
    yield { type: "token", text: noResult };
    return noResult;
  }

  let fullText = "";

  for await (const chunk of llm.generateStream({
    systemPrompt: STREAMING_RETRIEVAL_SYSTEM_PROMPT,
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

  const existingTags = await getExistingTags(supabase, userId);

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

  trackEvent(supabase, userId, "document.saved", sessionId, {
    doc_count: savedDocs.length,
  });

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

    throwIfSupabaseError(error);

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
    // Guaranteed non-null by JudgmentOutputSchema .refine()
    const targetId = judgment.target_id as string;

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
        const result = await persistDocument(
          supabase,
          providers,
          userId,
          sessionId,
          { action: "create" },
          splitDoc.body,
          existingTags,
        );
        results.push(result);
      }
      await deleteDocument(supabase, userId, targetId);
      return results;
    }

    return [
      await persistDocument(
        supabase,
        providers,
        userId,
        sessionId,
        { action: "update", targetId },
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
      { action: "create" },
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
  persistAction: PersistAction,
  body: string,
  existingTags: string[],
): Promise<{ id: string; title: string }> {
  const { llm } = providers;

  const meta = await llm.generateStructured({
    schema: MetaOutputSchema,
    schemaName: "meta",
    systemPrompt: META_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildMetaMessage(body, existingTags) }],
  });

  let docId: string;

  if (persistAction.action === "create") {
    const { data, error } = await supabase.rpc("create_document_with_event", {
      p_user_id: userId,
      p_title: meta.title,
      p_tags: meta.tags,
      p_summary: meta.summary,
      p_body: body,
      p_session_id: sessionId,
    });

    throwIfSupabaseError(error);

    docId = data as string;
  } else {
    docId = persistAction.targetId;

    const { error } = await supabase.rpc("update_document_with_event", {
      p_doc_id: docId,
      p_user_id: userId,
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

import { TRPCError } from "@trpc/server";

import type {
  ActionPayload,
  ChatStartInput,
  ChatStreamEvent,
  ConfirmDraftIntentInput,
  Locale,
  Message,
  MessageType,
  SearchResultDoc,
  SessionDraft,
} from "@nema-io/shared";
import {
  MessageSchema,
  SessionDraftSchema,
  STATUS_LOG_TYPES,
} from "@nema-io/shared";

import { cancelGeneration } from "@server/infra/chat-stream-manager";
import type { Json } from "@server/infra/database.types";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import { trackEvent } from "@server/services/event-service";

import {
  classifyDraftIntent,
  extractDraftContext,
  handleDraftingStream,
} from "./drafting";
import { handleRetrievalStream } from "./retrieval";

type Draft = SessionDraft;

interface ChatResponse {
  message: Message;
  draft: Draft | null;
}

async function getDraft(
  supabase: TypedSupabaseClient,
  sessionId: string,
): Promise<Draft | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("draft")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  return data.draft
    ? (SessionDraftSchema.safeParse(data.draft).data ?? null)
    : null;
}

async function setDraft({
  supabase,
  sessionId,
  body,
}: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  body: string;
}): Promise<void> {
  const draft: Draft = { body };
  const { error } = await supabase
    .from("sessions")
    .update({ draft })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
}

async function clearDraft(
  supabase: TypedSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ draft: null })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
}

async function insertRetrieval({
  supabase,
  sessionId,
  query,
  body,
  documents,
}: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  query: string;
  body: string;
  documents: SearchResultDoc[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("session_retrievals")
    .insert({ session_id: sessionId, query, body, documents })
    .select("id")
    .single();

  throwIfSupabaseError(error);
  return data.id;
}

async function appendMessage({
  supabase,
  sessionId,
  message,
}: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  message: Message;
}): Promise<void> {
  const { error } = await supabase.rpc("append_message", {
    p_session_id: sessionId,
    p_message: message,
  });

  throwIfSupabaseError(error);
}

async function createAssistantResponse(args: {
  supabase: TypedSupabaseClient;
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
  await appendMessage({
    supabase: args.supabase,
    sessionId: args.sessionId,
    message,
  });
  return { message, draft: null };
}

export async function* processChatStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  input: ChatStartInput;
  lng: Locale;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const { supabase, providers, userId, input, lng, signal } = args;

  const userMessage = MessageSchema.parse({
    id: input.messageId,
    role: "user",
    type: "text",
    content: input.content,
    createdAt: new Date().toISOString(),
  });

  await appendMessage({
    supabase,
    sessionId: input.sessionId,
    message: userMessage,
  });

  const draft = await getDraft(supabase, input.sessionId);

  let responseContent: string;
  let messageType: MessageType = "text";

  trackEvent({
    supabase,
    userId,
    type: "mode.selected",
    sessionId: input.sessionId,
    payload: { mode: input.mode },
  });

  switch (input.mode) {
    case "ask": {
      const result = yield* handleRetrievalStream({
        supabase,
        providers,
        userId,
        sessionId: input.sessionId,
        question: input.content,
        lng,
        signal,
      });
      if (result.hasResults) {
        await insertRetrieval({
          supabase,
          sessionId: input.sessionId,
          query: input.content,
          body: result.text,
          documents: result.documents,
        });
        responseContent = STATUS_LOG_TYPES.RETRIEVAL_ANSWERED;
        messageType = "status";
      } else {
        responseContent = result.text;
      }
      break;
    }
    case "remember": {
      if (draft) {
        const { intent } = await classifyDraftIntent({
          providers,
          userInput: input.content,
          previousBody: draft.body,
        });

        if (intent === "ambiguous") {
          const draftContext = extractDraftContext(draft.body);
          const actionMessage = MessageSchema.parse({
            id: crypto.randomUUID(),
            role: "assistant",
            type: "action",
            content: "",
            payload: {
              actionType: "draft_intent_confirmation",
              draftContext,
              status: "pending",
              selectedOption: null,
            },
            createdAt: new Date().toISOString(),
          });

          await appendMessage({
            supabase,
            sessionId: input.sessionId,
            message: actionMessage,
          });

          yield {
            type: "draft_intent_confirmation",
            actionMessageId: actionMessage.id,
            draftContext,
          };
          yield { type: "done" };
          return;
        }
      }

      // 첫 생성, append, replace → 기존 흐름 (edit cycle)
      yield { type: "draft_start" };
      const draftBody = yield* handleDraftingStream({
        providers,
        userInput: input.content,
        currentDraft: draft,
        signal,
      });
      await setDraft({ supabase, sessionId: input.sessionId, body: draftBody });
      responseContent = draft
        ? STATUS_LOG_TYPES.DRAFT_EDITED
        : STATUS_LOG_TYPES.DRAFT_CREATED;
      messageType = "status";
      break;
    }
    default: {
      const _exhaustive: never = input.mode;
      throw new Error(`Unhandled mode: ${_exhaustive}`);
    }
  }

  const assistantMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: messageType,
    content: responseContent,
    createdAt: new Date().toISOString(),
  });

  await appendMessage({
    supabase,
    sessionId: input.sessionId,
    message: assistantMessage,
  });

  yield { type: "done" };
}

export async function cancelDraftAction(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sessionId: string;
}): Promise<ChatResponse> {
  const { supabase, userId, sessionId } = args;

  cancelGeneration(userId, sessionId);
  await clearDraft(supabase, sessionId);

  return createAssistantResponse({
    supabase,
    sessionId,
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_CANCELLED,
  });
}

export function cancelGenerationAction(
  userId: string,
  sessionId: string,
): void {
  cancelGeneration(userId, sessionId);
}

async function updateMessagePayload(args: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  messageId: string;
  payload: ActionPayload;
}): Promise<void> {
  const { error } = await args.supabase.rpc("update_message_payload", {
    p_session_id: args.sessionId,
    p_message_id: args.messageId,
    p_payload: JSON.parse(JSON.stringify(args.payload)) as Json,
  });

  throwIfSupabaseError(error);
}

async function getMessages(
  supabase: TypedSupabaseClient,
  sessionId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("messages")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  const raw = (data.messages ?? []) as unknown[];
  return raw
    .map((m) => MessageSchema.safeParse(m))
    .filter((r) => r.success)
    .map((r) => r.data);
}

function findLastUserMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return messages[i];
    }
  }
  return undefined;
}

export async function* confirmDraftIntentStream(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  input: ConfirmDraftIntentInput;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const { supabase, providers, input, signal } = args;

  const [messages, draft] = await Promise.all([
    getMessages(supabase, input.sessionId),
    getDraft(supabase, input.sessionId),
  ]);

  const userMessage = findLastUserMessage(messages);
  if (!userMessage) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "No user message found for draft intent confirmation",
    });
  }

  const currentDraft = input.intent === "replace" ? null : draft;

  yield { type: "draft_start" };
  const draftBody = yield* handleDraftingStream({
    providers,
    userInput: userMessage.content,
    currentDraft,
    signal,
  });

  await setDraft({ supabase, sessionId: input.sessionId, body: draftBody });

  await updateMessagePayload({
    supabase,
    sessionId: input.sessionId,
    messageId: input.actionMessageId,
    payload: {
      actionType: "draft_intent_confirmation",
      draftContext: input.draftContext,
      status: "resolved",
      selectedOption: input.intent,
    },
  });

  const statusMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: "status",
    content:
      input.intent === "replace"
        ? STATUS_LOG_TYPES.DRAFT_CREATED
        : STATUS_LOG_TYPES.DRAFT_EDITED,
    createdAt: new Date().toISOString(),
  });

  await appendMessage({
    supabase,
    sessionId: input.sessionId,
    message: statusMessage,
  });

  yield { type: "done" };
}

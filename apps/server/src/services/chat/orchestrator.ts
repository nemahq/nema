import { z } from "zod";
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

import { getLlmModels } from "@server/infra/llm/models";
import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildIntentRouterMessage,
  INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
  INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
} from "@server/prompts/intent-router";
import { trackEvent } from "@server/services/event-service";

import { handleDraftingStream } from "./drafting";
import { handleRetrievalStream } from "./retrieval";
import { handleSave } from "./saving";

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

  return data.draft ? SessionDraftSchema.parse(data.draft) : null;
}

async function setDraft(
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ draft: null })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
}

async function appendMessage(
  supabase: TypedSupabaseClient,
  sessionId: string,
  message: Message,
): Promise<void> {
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
  await appendMessage(args.supabase, args.sessionId, message);
  return { message, draft: null };
}

export async function* processChatStream(args: {
  supabase: TypedSupabaseClient;
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
      model: getLlmModels().mini,
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
      model: getLlmModels().mini,
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
        await clearDraft(supabase, input.sessionId);
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
  supabase: TypedSupabaseClient;
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
  await clearDraft(supabase, sessionId);

  return createAssistantResponse({
    supabase,
    sessionId,
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_SAVED,
  });
}

export async function cancelDraftAction(args: {
  supabase: TypedSupabaseClient;
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

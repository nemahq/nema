import { z } from "zod";

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

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import {
  buildIntentRouterMessage,
  INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
  INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
} from "@server/prompts/intent-router";
import { trackEvent } from "@server/services/event-service";
import {
  enqueueSaveJob,
  processSaveJobBackground,
} from "@server/services/save-job-service";

import { handleDraftingStream } from "./drafting";
import { handleRetrievalStream } from "./retrieval";

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

  await appendMessage({
    supabase,
    sessionId: input.sessionId,
    message: userMessage,
  });

  const draft = await getDraft(supabase, input.sessionId);

  let responseContent: string;
  let messageType: MessageType = "text";

  if (draft === null) {
    const intentResult = await providers.llm.mini.generateStructured({
      schema: InactiveIntentSchema,
      schemaName: "intent_router_inactive",
      systemPrompt: INTENT_ROUTER_INACTIVE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildIntentRouterMessage(input.content) },
      ],
    });

    trackEvent({
      supabase,
      userId,
      type: "intent.classified",
      sessionId: input.sessionId,
      payload: { intent: intentResult.intent },
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
      await setDraft({ supabase, sessionId: input.sessionId, body: draftBody });
      responseContent = STATUS_LOG_TYPES.DRAFT_CREATED;
      messageType = "status";
    }
  } else {
    const intentResult = await providers.llm.mini.generateStructured({
      schema: ActiveIntentSchema,
      schemaName: "intent_router_active",
      systemPrompt: INTENT_ROUTER_ACTIVE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildIntentRouterMessage(input.content) },
      ],
    });

    trackEvent({
      supabase,
      userId,
      type: "intent.classified",
      sessionId: input.sessionId,
      payload: { intent: intentResult.intent },
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
        await setDraft({
          supabase,
          sessionId: input.sessionId,
          body: editedBody,
        });
        responseContent = STATUS_LOG_TYPES.DRAFT_EDITED;
        messageType = "status";
        break;
      }
      case "save": {
        const job = await enqueueSaveJob({
          supabase,
          userId,
          sessionId: input.sessionId,
        });
        void processSaveJobBackground({
          supabase,
          providers,
          userId,
          jobId: job.id,
        });
        responseContent = STATUS_LOG_TYPES.DRAFT_SAVED;
        messageType = "status";
        break;
      }
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

  await appendMessage({
    supabase,
    sessionId: input.sessionId,
    message: assistantMessage,
  });

  yield { type: "done" };
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

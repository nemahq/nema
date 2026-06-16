import * as Sentry from "@sentry/node";

import type { ChatStreamEvent, SessionDraft } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import {
  buildDraftIntentMessage,
  DRAFT_INTENT_SYSTEM_PROMPT,
  type DraftIntent,
  DraftIntentSchema,
} from "@server/prompts/draft-intent";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";

type Draft = SessionDraft;

const DRAFT_DISPLAY_CONTEXT_MAX_LENGTH = 50;

export function extractDraftContext(draftBody: string): string {
  const firstLine = draftBody.split("\n")[0].replace(/^#+\s*/, "");
  return firstLine.length > DRAFT_DISPLAY_CONTEXT_MAX_LENGTH
    ? firstLine.slice(0, DRAFT_DISPLAY_CONTEXT_MAX_LENGTH) + "..."
    : firstLine;
}

export async function classifyDraftIntent(args: {
  providers: Providers;
  userInput: string;
  previousBody: string;
}): Promise<DraftIntent> {
  try {
    return await args.providers.llm
      .forTask("classifyDraftIntent")
      .generateStructured({
        schema: DraftIntentSchema,
        schemaName: "draft_intent_classifier",
        systemPrompt: DRAFT_INTENT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildDraftIntentMessage({
              previousBody: args.previousBody,
              userInput: args.userInput,
            }),
          },
        ],
      });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "draft-intent-classifier" },
    });
    return { intent: "append" };
  }
}

export async function* handleDraftingStream(args: {
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

  for await (const chunk of providers.llm
    .forTask("generateDraft")
    .generateStream({
      systemPrompt: DRAFTING_SYSTEM_PROMPT,
      messages: [{ role: "user", content: message }],
      signal,
    })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return fullText;
}

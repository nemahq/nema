import type {
  ChatStreamEvent,
  ContentLanguage,
  SessionDraft,
} from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import {
  buildEditCycleMessage,
  buildFirstCallMessage,
  DRAFTING_SYSTEM_PROMPT,
} from "@server/prompts/drafting";

type Draft = SessionDraft;

export async function* handleDraftingStream(args: {
  providers: Providers;
  userInput: string;
  currentDraft: Draft | null;
  contentLanguage: ContentLanguage;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent, string> {
  const { providers, userInput, currentDraft, contentLanguage, signal } = args;

  const isFirstCall = currentDraft === null;
  const message = isFirstCall
    ? buildFirstCallMessage(userInput, contentLanguage)
    : buildEditCycleMessage({
        previousBody: currentDraft.body,
        editRequest: userInput,
        contentLanguage,
      });

  let fullText = "";

  for await (const chunk of providers.llm.standard.generateStream({
    systemPrompt: DRAFTING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: message }],
    signal,
  })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return fullText;
}

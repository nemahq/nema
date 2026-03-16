import type { ChatStreamEvent, SessionDraft } from "@nema-io/shared";

import { getLlmModels } from "@server/infra/llm/models";
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
    model: getLlmModels().standard,
    signal,
  })) {
    fullText += chunk;
    yield { type: "token", text: chunk };
  }

  return fullText;
}

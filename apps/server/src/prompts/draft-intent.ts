// 드래프트 의도 분류 — 편집 사이클에서 사용자 요청이 추가/교체/모호 중 어디에 해당하는지 판별

import { z } from "zod";

export const DRAFT_INTENT_SYSTEM_PROMPT = `You classify the user's intent when they send a follow-up message to an existing draft.

Given the existing draft body and the user's new message, determine the intent:

- **append**: The new message stays within the SAME topic or context as the existing draft, OR uses an explicit add signal (words meaning "also/too" combined with an add request).
- **replace**: The user wants to MODIFY, REWRITE, or CORRECT the existing draft (requests to rewrite, shorten, change tone, fix errors, or restructure).
- **ambiguous**: The new message introduces a DIFFERENT topic from the existing draft, without an explicit add or modify signal.

Important:
- To decide between append and ambiguous, check whether the new message's topic overlaps with the existing draft. If the topics are different and there is no explicit signal, classify as "ambiguous".
- Short messages with an explicit add signal (meaning "also this", "add this too") are always "append", regardless of topic.`;

export const DraftIntentSchema = z.object({
  intent: z.enum(["append", "replace", "ambiguous"]),
});
export type DraftIntent = z.infer<typeof DraftIntentSchema>;

const DRAFT_CONTEXT_MAX_LENGTH = 300;

export function buildDraftIntentMessage(args: {
  previousBody: string;
  userInput: string;
}): string {
  const truncatedBody =
    args.previousBody.length > DRAFT_CONTEXT_MAX_LENGTH
      ? args.previousBody.slice(0, DRAFT_CONTEXT_MAX_LENGTH) + "..."
      : args.previousBody;

  return `<existing_draft>${truncatedBody}</existing_draft>\n\n<user_message>${args.userInput}</user_message>`;
}

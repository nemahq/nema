// 드래프트 의도 분류 — 편집 사이클에서 사용자 요청이 추가/교체/모호 중 어디에 해당하는지 판별

import { z } from "zod";

export const DRAFT_INTENT_SYSTEM_PROMPT = `You classify the user's intent when they send a follow-up message to an existing draft.

Given the existing draft body and the user's new message, determine the intent:

- **append**: The user clearly wants to ADD new content to the existing draft. Signals: "~도 추가해줘", "~도 넣어줘", "아 그리고", adding a new section or data point to what already exists.
- **replace**: The user clearly wants to MODIFY, REWRITE, or CORRECT the existing draft. Signals: "수정해줘", "바꿔줘", "더 간결하게", "톤을 바꿔", fixing errors, restructuring existing content.
- **ambiguous**: The user introduces a topic that has NO clear connection to the existing draft, and it is unclear whether they want to add it to the draft or start a completely new one.

Important:
- Default to "append" when in doubt between append and ambiguous.
- Only classify as "ambiguous" when the new topic is clearly unrelated AND there is no explicit add/modify signal.
- Short messages like "이것도" or "추가" are append signals, not ambiguous.`;

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

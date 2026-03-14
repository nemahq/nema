export const SESSION_TITLE_SYSTEM_PROMPT = `You generate a short descriptive title (3-8 words) for a chat session based on the user's first message. The title should capture the main topic.

<instructions>
## Rules

1. Capture the core topic, not every detail.
2. Use noun phrases or short sentences.
3. Always output in English, regardless of input language.
4. Output the title as plain text only. No JSON, no quotes, no extra formatting.
</instructions>

<examples>
<example>
<input>투자자 미팅 다녀옴. 반응 꽤 좋았는데 밸류에이션 부분에서 좀 밀림</input>
<output>Investor meeting debrief</output>
</example>
<example>
<input>프론트엔드 시니어 면접 어떻게 됐었지?</input>
<output>Senior frontend interview results</output>
</example>
</examples>`;

export function buildSessionTitleMessage(userInput: string): string {
  return `<input>${userInput}</input>`;
}

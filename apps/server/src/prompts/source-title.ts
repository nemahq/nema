// =============================================================
// Source 제목 — 원본을 목록에서 알아볼 수 있게 하는 짧은 헤드라인 (LLM 1콜, nano)
//
// Digest 생성 콜에 얹혀 나오던 걸 뗐다. 제목은 "이 글이 무엇에 관한 글인가"만
// 답하면 되고 판단 추출 결과에 의존하지 않는다 — 무거운 콜(원문 전체 분석,
// standard)을 기다릴 이유가 없어 생성 시점에 body만 보고 바로 뽑는다.
// session-title과 같은 결이라 출력도 평문 한 줄(구조화 출력 오버헤드 없음).
// =============================================================

// nano에 100k자(SOURCE_BODY_MAX_LENGTH)를 통째로 밀어 넣지 않는다 — 제목은 글의
// 도입부만 봐도 나오고(ChatGPT가 첫 메시지만 보고 세션 제목을 뽑는 것과 같다),
// 긴 글일수록 앞부분이 무엇에 관한 글인지 이미 말한다. 잘린 뒷부분 때문에 제목이
// 나빠지는 손해보다 장문 하나가 콜 비용·지연을 튀게 하는 손해가 크다.
const TITLE_INPUT_MAX_CHARS = 4_000;

export const SOURCE_TITLE_SYSTEM_PROMPT = `You generate a short headline (3-8 words) for a raw note the user just saved. The headline is what a person scanning a list of notes reads to tell this one apart from the others.

<instructions>
## Rules

1. Capture what the note is about, not every detail.
2. Use noun phrases or short sentences.
3. Always produce a headline. A note with no substance (greetings, filler, a stray link) still gets one — summarize what little it is about.
4. The note may be cut off partway. Title what is there; never mention that it is truncated.
5. Output in the same language as the note.
6. Output the headline as plain text only. No JSON, no quotes, no extra formatting.
</instructions>

<examples>
<example>
<input>배포 도구 다시 봤는데 Vercel은 가격이 걸리고 Railway가 나을 듯. 팀 규모 생각하면 관리 부담도 적고.</input>
<output>배포 도구 선정 — Railway 쪽으로</output>
</example>
<example>
<input>Talked to three customers today. All of them brought up the same onboarding drop-off at the invite step.</input>
<output>Customer calls — onboarding drop-off at invite</output>
</example>
<example>
<input>ㅋㅋㅋ 오늘 점심 뭐 먹지</input>
<output>점심 메뉴 잡담</output>
</example>
</examples>`;

export function buildSourceTitleMessage(body: string): string {
  return `<note>${body.slice(0, TITLE_INPUT_MAX_CHARS)}</note>`;
}

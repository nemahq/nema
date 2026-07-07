// 본문 정제 규칙 — 사본이 갈리면 drift라 한 곳에만 둔다.
// 기준의 제품 정의: docs/foundations/13-drafting-criteria.md

export const BODY_REFINEMENT_RULES = `The output is a draft the user will glance at and confirm as "this is what I meant." Preserving meaning is the hard floor; readability serves that glance. Never change, add, or drop meaning.

1. Cut what carries no meaning, keep what does. The test: would removing it change how the writer understands or decides when revisiting weeks later? If yes, keep it. If no, drop it. When unsure, keep it.
2. Emotional venting and tone are noise — drop them (e.g. "ㅋㅋ", "진짜 힘들다", "빡셌다"; drop, do not formalize into "very intense"). But when an emotion is the reason behind something ("팀이 지쳐서 일정을 미룸"), it carries meaning — keep it.
3. Preserve degree, certainty, and vagueness — what they convey, not the exact wording. Degree: keep the strength. Do not drop a hedge ("좀 느림" must not flatten to "느림") or shift it ("a bit" must not become "fairly"/"very"). A same-strength reword is fine ("좀" → "다소"). Certainty: "아마 늦을 듯" must not become "늦는다" (a guess turned into a fact). Vagueness: "그 건은 보류" stays vague — do not specify what the user left unstated. These shape the meaning, so changing them changes the meaning.
4. Add nothing the user did not say. No inference, no elaboration, no filling gaps. The only changes that add no meaning are fixing vocabulary and obvious typos — those are allowed.
5. Let structure follow the input. Surface the input's own organization: use subheadings (##) and lists (-) when it has multiple distinct points, keep it to 1-2 paragraphs when it is one thought, and preserve the existing structure when the input is already organized. Do not impose a document-type template or invent empty slots. Allowed markdown: headings (##) and unordered lists (-) only — do not use bold (**), italics, tables, or any other markdown, even for labels.
6. Write in the same language as the input.`;

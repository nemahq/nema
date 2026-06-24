import { z } from "zod";

// =============================================================
// 질의 구조화 — 검색어를 의미부 + 시간 토큰 + 주제로 가른다
// (temporal-query-design 5장, auto-scoping-design §3.2).
//
// 시간 질의("이번 주 마감")는 임베딩이 못 푸는 날짜 산술이라, 의미검색에 태우기 전에
// 시간 부분을 떼어 구조화된 시간 경로로 보낸다. 같은 콜에서 질의를 공간 주제 목록에
// 라우팅한다(coarse). 출력은 flat 스키마 — discriminated union을 provider JSON schema에
// 태우지 않고, 코드가 TimeToken으로 매핑·검증한다(query-structuring 서비스).
// =============================================================

export const QUERY_STRUCTURING_SYSTEM_PROMPT = `You turn a search query into a structured form with three parts: its meaning, its time constraint, and the topics it belongs to.

The user searches their own notes. Some queries carry a time constraint ("anything due this week", "what did I do last week"); most do not ("why did we pick Toss"). Separate the time part out so a date filter can handle it, leave the rest as a semantic query, and route the query to the user's topics.

## Output

A JSON object: { "semantic": string | null, "time": <time object> | null, "topicIds": string[] }

- "semantic": the part of the query left after removing the time expression — what to match by meaning. Null if the query is purely about time with nothing to match semantically.
- "time": the time constraint, or null if the query has none.
- "topicIds": ids of the topics (from <topics>) whose notes most likely hold the answer. See ## topics.

## The time object

{ "field", "boundary", "anchorKind", "grain", "offset", "weekday", "scope", "date" }

- "field": "created" — the time the note was written ("what did I do last week", "notes from yesterday"). "due" — a deadline inside the content ("due this week", "deadline Friday").
- "boundary": "within" — the whole period ("this week", "in June"). "by" — up to a point, a deadline ("by Friday", "due this week" means by end of week).
- "anchorKind" picks which of the remaining fields are used:
  - "relative": set "grain" ("day" | "week" | "month" | "quarter") and "offset" (integer: this=0, next=+1, last=-1, the day after tomorrow=+2). Leave weekday/scope/date null.
  - "weekday": set "weekday" ("mon".."sun") and "scope" ("this" | "next"). Leave grain/offset/date null. Use for a named weekday ("Friday", "next Wednesday").
  - "absolute": set "date" ("YYYY-MM-DD"). Leave the others null. Use for an explicit calendar date ("Feb 14"). When the query omits the year, resolve it against <today>: pick the nearest sensible occurrence (a deadline is usually today or later).

Unused fields MUST be null. Do not invent a time constraint that is not in the query — when in doubt, set "time" to null and keep everything in "semantic".

## topics

You get the user's topics in <topics>, each as "[id] label". Pick the ids whose notes could answer the query.

- Optimize for recall, not precision. If a topic could plausibly hold the answer, include it. A later step searches inside the picked topics, so extra picks are cheap, but missing the right topic loses the answer entirely.
- If the query spans several topics, pick all of them.
- If the query is too vague to place, or no topic fits, return an empty list. A later step then searches everything.
- Return only ids that appear in <topics>.

## Examples

(no <topics> given in these — "topicIds" is empty)

Query: "다음주에 예정된 일이 뭐가 있지?"
{ "semantic": null, "time": { "field": "due", "boundary": "within", "anchorKind": "relative", "grain": "week", "offset": 1, "weekday": null, "scope": null, "date": null }, "topicIds": [] }

Query: "이번 주 안에 마감인 거 있나?"
{ "semantic": null, "time": { "field": "due", "boundary": "by", "anchorKind": "relative", "grain": "week", "offset": 0, "weekday": null, "scope": null, "date": null }, "topicIds": [] }

Query: "금요일까지 끝내야 하는 거?"
{ "semantic": null, "time": { "field": "due", "boundary": "by", "anchorKind": "weekday", "grain": null, "offset": null, "weekday": "fri", "scope": "this", "date": null }, "topicIds": [] }

Query: "2월 14일까지 마감인 거?" (with <today>2026-01-20</today>)
{ "semantic": null, "time": { "field": "due", "boundary": "by", "anchorKind": "absolute", "grain": null, "offset": null, "weekday": null, "scope": null, "date": "2026-02-14" }, "topicIds": [] }

The next examples include <topics>:

<topics>
- [pay] 결제 연동
- [b2b] B2B 전환
- [infra] 인프라 개편
</topics>
Query: "토스로 결제 정한 이유가 뭐였지?"
{ "semantic": "토스로 결제 정한 이유", "time": null, "topicIds": ["pay"] }

<topics>
- [pay] 결제 연동
- [b2b] B2B 전환
- [infra] 인프라 개편
</topics>
Query: "지난주 결제 쪽에서 정한 거?"
{ "semantic": "결제 관련 결정", "time": { "field": "created", "boundary": "within", "anchorKind": "relative", "grain": "week", "offset": -1, "weekday": null, "scope": null, "date": null }, "topicIds": ["pay"] }

<topics>
- [pay] 결제 연동
- [b2b] B2B 전환
- [infra] 인프라 개편
</topics>
Query: "그때 그거 어떻게 됐더라?"
{ "semantic": "그때 그거", "time": null, "topicIds": [] }`;

const RawTimeSchema = z.object({
  field: z.enum(["created", "due"]),
  boundary: z.enum(["within", "by"]),
  anchorKind: z.enum(["relative", "weekday", "absolute"]),
  grain: z.enum(["day", "week", "month", "quarter"]).nullable(),
  offset: z.number().int().nullable(),
  weekday: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]).nullable(),
  scope: z.enum(["this", "next"]).nullable(),
  date: z.string().nullable(),
});

export type RawTime = z.infer<typeof RawTimeSchema>;

export const QueryStructuringRawSchema = z.object({
  semantic: z.string().nullable(),
  time: RawTimeSchema.nullable(),
  topicIds: z.array(z.string()),
});

export type QueryStructuringRaw = z.infer<typeof QueryStructuringRawSchema>;

export interface QueryStructuringTopic {
  id: string;
  label: string;
}

// todayIsoDate(YYYY-MM-DD)는 절대 날짜의 연도 보정 기준 — 프롬프트가 정적이라
// 이걸 안 주면 모델이 오늘을 몰라 학습 컷오프 기준으로 연도를 추측한다.
// topics가 비면 <topics>를 생략 = 라우팅할 주제 없음(전역).
export function buildQueryStructuringMessage(args: {
  query: string;
  todayIsoDate: string;
  topics: QueryStructuringTopic[];
}): string {
  const { query, todayIsoDate, topics } = args;
  const topicsBlock =
    topics.length > 0
      ? `<topics>\n${topics.map((t) => `- [${t.id}] ${t.label}`).join("\n")}\n</topics>\n`
      : "";
  return `<today>${todayIsoDate}</today>\n${topicsBlock}<query>${query}</query>`;
}

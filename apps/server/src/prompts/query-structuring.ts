import { z } from "zod";

// =============================================================
// 질의 구조화 — 검색어를 의미부 + 시간 토큰으로 가른다 (temporal-query-design 5장).
//
// 시간 질의("이번 주 마감")는 임베딩이 못 푸는 날짜 산술이라, 의미검색에 태우기 전에
// 시간 부분을 떼어 구조화된 시간 경로로 보낸다. 출력은 flat 스키마 — discriminated union을
// provider JSON schema에 태우지 않고, 코드가 TimeToken으로 매핑·검증한다(query-structuring 서비스).
// =============================================================

export const QUERY_STRUCTURING_SYSTEM_PROMPT = `You split a search query into two parts: its meaning and its time constraint.

The user searches their own notes. Some queries carry a time constraint ("anything due this week", "what did I do last week"); most do not ("why did we pick Toss"). Your job is to separate the time part out so a date filter can handle it, leaving the rest as a semantic query.

## Output

A JSON object: { "semantic": string | null, "time": <time object> | null }

- "semantic": the part of the query left after removing the time expression — what to match by meaning. Null if the query is purely about time with nothing to match semantically.
- "time": the time constraint, or null if the query has none.

## The time object

{ "field", "boundary", "anchorKind", "grain", "offset", "weekday", "scope", "date" }

- "field": "created" — the time the note was written ("what did I do last week", "notes from yesterday"). "due" — a deadline inside the content ("due this week", "deadline Friday").
- "boundary": "within" — the whole period ("this week", "in June"). "by" — up to a point, a deadline ("by Friday", "due this week" means by end of week).
- "anchorKind" picks which of the remaining fields are used:
  - "relative": set "grain" ("day" | "week" | "month" | "quarter") and "offset" (integer: this=0, next=+1, last=-1, the day after tomorrow=+2). Leave weekday/scope/date null.
  - "weekday": set "weekday" ("mon".."sun") and "scope" ("this" | "next"). Leave grain/offset/date null. Use for a named weekday ("Friday", "next Wednesday").
  - "absolute": set "date" ("YYYY-MM-DD"). Leave the others null. Use for an explicit calendar date ("Feb 14"). Infer the year from context if the query omits it; prefer the nearest sensible one.

Unused fields MUST be null. Do not invent a time constraint that is not in the query — when in doubt, set "time" to null and keep everything in "semantic".

## Examples

Query: "다음주에 예정된 일이 뭐가 있지?"
{ "semantic": null, "time": { "field": "due", "boundary": "within", "anchorKind": "relative", "grain": "week", "offset": 1, "weekday": null, "scope": null, "date": null } }

Query: "이번 주 안에 마감인 거 있나?"
{ "semantic": null, "time": { "field": "due", "boundary": "by", "anchorKind": "relative", "grain": "week", "offset": 0, "weekday": null, "scope": null, "date": null } }

Query: "다음주 백엔드 관련 마감 있어?"
{ "semantic": "백엔드 관련", "time": { "field": "due", "boundary": "within", "anchorKind": "relative", "grain": "week", "offset": 1, "weekday": null, "scope": null, "date": null } }

Query: "지난주에 결제 관련해서 뭐 정했지?"
{ "semantic": "결제 관련 결정", "time": { "field": "created", "boundary": "within", "anchorKind": "relative", "grain": "week", "offset": -1, "weekday": null, "scope": null, "date": null } }

Query: "금요일까지 끝내야 하는 거?"
{ "semantic": null, "time": { "field": "due", "boundary": "by", "anchorKind": "weekday", "grain": null, "offset": null, "weekday": "fri", "scope": "this", "date": null } }

Query: "토스로 결제 정한 이유가 뭐였지?"
{ "semantic": "토스로 결제 정한 이유", "time": null }`;

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
});

export type QueryStructuringRaw = z.infer<typeof QueryStructuringRawSchema>;

export function buildQueryStructuringMessage(query: string): string {
  return `<query>${query}</query>`;
}

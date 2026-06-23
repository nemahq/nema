import { z } from "zod";

// 시간 표현의 구조화 토큰 (temporal-query-design 3장).
// 질의 파싱(LLM 구조화 출력)과 기한 추출이 공유하는 계약 — zod로 두어 구조화 레이어가
// generateStructured로 바로 검증해 뱉을 수 있게 한다.

export const TimeFieldSchema = z.enum(["created", "due"]);
export type TimeField = z.infer<typeof TimeFieldSchema>;

// within = 그 기간 전체, by = 그 시점 이하(마감류 "~까지/내"). 앵커와 직교한다.
export const TimeBoundarySchema = z.enum(["within", "by"]);
export type TimeBoundary = z.infer<typeof TimeBoundarySchema>;

export const TimeGrainSchema = z.enum(["day", "week", "month", "quarter"]);
export type TimeGrain = z.infer<typeof TimeGrainSchema>;

export const WeekdaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);
export type Weekday = z.infer<typeof WeekdaySchema>;

const ABSOLUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const RelativeAnchorSchema = z.object({
  kind: z.literal("relative"),
  grain: TimeGrainSchema,
  // 기준 기간으로부터의 칸 수. 이번=0, 다음=+1, 지난=-1, 모레=+2 등 임의 정수.
  offset: z.number().int(),
});

const WeekdayAnchorSchema = z.object({
  kind: z.literal("weekday"),
  day: WeekdaySchema,
  scope: z.enum(["this", "next"]),
});

const AbsoluteAnchorSchema = z.object({
  kind: z.literal("absolute"),
  date: z.string().regex(ABSOLUTE_DATE_PATTERN),
});

export const TimeAnchorSchema = z.discriminatedUnion("kind", [
  RelativeAnchorSchema,
  WeekdayAnchorSchema,
  AbsoluteAnchorSchema,
]);
export type TimeAnchor = z.infer<typeof TimeAnchorSchema>;

export const TimeTokenSchema = z.object({
  field: TimeFieldSchema,
  boundary: TimeBoundarySchema,
  anchor: TimeAnchorSchema,
});
export type TimeToken = z.infer<typeof TimeTokenSchema>;

import { DateTime } from "luxon";
import { z } from "zod";

// 시간 표현의 구조화 토큰 (temporal-query-design 3장).
// 질의 파싱(LLM 구조화 출력)과 기한 추출이 공유하는 계약 — zod로 두어 구조화 레이어가
// generateStructured로 바로 검증해 뱉을 수 있게 한다.

// 보조 스키마는 TimeTokenSchema의 부품 — 소비처가 직접 쓰게 되면 그때 export한다.
const TimeFieldSchema = z.enum(["created", "due"]);

// within = 그 기간 전체, by = 그 시점 이하(마감류 "~까지/내"). 앵커와 직교한다.
const TimeBoundarySchema = z.enum(["within", "by"]);

const TimeGrainSchema = z.enum(["day", "week", "month", "quarter"]);

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

export const ABSOLUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
  // 형식뿐 아니라 실재 날짜까지 — 2026-02-30 같은 LLM 출력 오류를 parse 단계에서 거른다.
  date: z
    .string()
    .regex(ABSOLUTE_DATE_PATTERN)
    .refine((value) => DateTime.fromISO(value).isValid, {
      message: "absolute date must be a real calendar date",
    }),
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

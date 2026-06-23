import { DateTime } from "luxon";
import { z } from "zod";

import { resolveTimeToken } from "./resolver";
import { type TimeAnchor, TimeTokenSchema, WeekdaySchema } from "./token";

// 추출이 진술마다 내는 기한 토큰 (temporal-query-design 7장). field는 항상 due(내용 속 기한)라
// 생략하고, flat 스키마로 둔다 — provider JSON schema에 discriminated union을 안 태우려고.
export const ExtractedDeadlineSchema = z.object({
  boundary: z.enum(["within", "by"]),
  anchorKind: z.enum(["relative", "weekday", "absolute"]),
  grain: z.enum(["day", "week", "month", "quarter"]).nullable(),
  offset: z.number().int().nullable(),
  weekday: WeekdaySchema.nullable(),
  scope: z.enum(["this", "next"]).nullable(),
  date: z.string().nullable(),
});

export type ExtractedDeadline = z.infer<typeof ExtractedDeadlineSchema>;

function buildAnchor(deadline: ExtractedDeadline): TimeAnchor | null {
  switch (deadline.anchorKind) {
    case "relative":
      if (deadline.grain === null || deadline.offset === null) {
        return null;
      }
      return {
        kind: "relative",
        grain: deadline.grain,
        offset: deadline.offset,
      };
    case "weekday":
      if (deadline.weekday === null || deadline.scope === null) {
        return null;
      }
      return { kind: "weekday", day: deadline.weekday, scope: deadline.scope };
    case "absolute":
      if (deadline.date === null) {
        return null;
      }
      return { kind: "absolute", date: deadline.date };
  }
}

// 기한 토큰 + 작성 기준(시각·존) → 저장할 due_date(YYYY-MM-DD). 마감은 "언제까지"라
// 한 점이므로 범위의 상한(range.to)의 날을 쓴다(작성자 존 기준).
// 불완전·불가능 토큰이나 잘못된 존은 null로 떨어뜨린다 — 쓰레기 토큰 하나가 추출 전체를
// 깨지 않게(기한 없는 진술로 저장).
export function resolveDeadlineToDueDate(
  deadline: ExtractedDeadline,
  context: { reference: Date; timeZone: string },
): string | null {
  const anchor = buildAnchor(deadline);
  if (anchor === null) {
    return null;
  }
  const parsed = TimeTokenSchema.safeParse({
    field: "due",
    boundary: deadline.boundary,
    anchor,
  });
  if (!parsed.success) {
    return null;
  }
  try {
    const range = resolveTimeToken(parsed.data, context);
    return DateTime.fromJSDate(range.to, {
      zone: context.timeZone,
    }).toISODate();
  } catch {
    return null;
  }
}

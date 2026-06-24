import type { Providers } from "@server/infra/providers";
import {
  buildQueryStructuringMessage,
  QUERY_STRUCTURING_SYSTEM_PROMPT,
  type QueryStructuringRaw,
  QueryStructuringRawSchema,
  type RawTime,
} from "@server/prompts/query-structuring";
import type { TimeAnchor, TimeToken } from "@server/temporal/token";
import { TimeTokenSchema } from "@server/temporal/token";

export interface QueryStructure {
  /** 시간 표현을 뺀 의미 나머지. null이면 순수 시간 질의(의미검색 없이 시간 필터만). */
  semantic: string | null;
  /** 시간 제약. null이면 시간 질의가 아니다(의미검색으로 강등). */
  time: TimeToken | null;
}

// flat 앵커 필드 → TimeAnchor. anchorKind가 가리키는 필드가 비면 null(불완전 출력 → 시간 강등).
function buildAnchor(raw: RawTime): TimeAnchor | null {
  switch (raw.anchorKind) {
    case "relative":
      if (raw.grain === null || raw.offset === null) {
        return null;
      }
      return { kind: "relative", grain: raw.grain, offset: raw.offset };
    case "weekday":
      if (raw.weekday === null || raw.scope === null) {
        return null;
      }
      return { kind: "weekday", day: raw.weekday, scope: raw.scope };
    case "absolute":
      if (raw.date === null) {
        return null;
      }
      return { kind: "absolute", date: raw.date };
  }
}

// LLM의 flat 출력을 엄격한 TimeToken으로 좁힌다. 불완전·불가능(2026-02-30 등) 토큰은
// time=null로 떨어뜨려 의미검색으로 강등한다 — 시간 경로가 쓰레기 토큰으로 깨지지 않게.
export function mapRawToStructure(raw: QueryStructuringRaw): QueryStructure {
  const trimmed = raw.semantic?.trim();
  const semantic = trimmed ? trimmed : null;

  if (raw.time === null) {
    return { semantic, time: null };
  }
  const anchor = buildAnchor(raw.time);
  if (anchor === null) {
    return { semantic, time: null };
  }
  const parsed = TimeTokenSchema.safeParse({
    field: raw.time.field,
    boundary: raw.time.boundary,
    anchor,
  });
  return { semantic, time: parsed.success ? parsed.data : null };
}

export async function structureQuery(args: {
  providers: Providers;
  query: string;
  /** 오늘(YYYY-MM-DD) — 절대 날짜("2월 14일")의 연도 보정 기준. 질의자 존 기준 날짜. */
  todayIsoDate: string;
}): Promise<QueryStructure> {
  const raw = await args.providers.llm
    .forTask("structureQuery")
    .generateStructured({
      schema: QueryStructuringRawSchema,
      schemaName: "query_structuring",
      systemPrompt: QUERY_STRUCTURING_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: buildQueryStructuringMessage(args.query, args.todayIsoDate),
        },
      ],
    });
  return mapRawToStructure(raw);
}

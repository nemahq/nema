import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { resolveTimeToken } from "@server/temporal/resolver";
import { TimeTokenSchema } from "@server/temporal/token";

import {
  RELOCATED_TEMPORAL_QUERIES,
  SEED_DOCUMENTS,
  TEMPORAL_EVAL_QUERY_NOW,
} from "./seed-data";

// 시간 경로 eval (temporal-query-design 8장 B, 채점 가).
//
// 재배치의 핵심 주장: 시간 질의는 임베딩이 아니라 구조화된 시간 경로(토큰→날짜 필터)로
// 답해야 정확하다. 골든 진술에 dueDate를 라벨하고, 기대 토큰을 고정 기준일로 풀어
// due_date 필터를 돌렸을 때 q12·q13이 기대 진술을 정확히(교란 배제) 끌어오는지 본다.
// 결정적이라(LLM 없음) CI에서 항상 돈다 — 질의→토큰 LLM 정확도(채점 나)는 run-time-path.ts.

const EVAL_ZONE = "UTC";

const labeledCorpus = SEED_DOCUMENTS.flatMap((doc) =>
  doc.goldenStatements.flatMap((statement) =>
    statement.dueDate !== undefined
      ? [{ id: statement.id, dueDate: statement.dueDate }]
      : [],
  ),
);

function isoDate(instant: Date): string {
  const date = DateTime.fromJSDate(instant, { zone: EVAL_ZONE }).toISODate();
  if (date === null) {
    throw new Error("isoDate: invalid instant");
  }
  return date;
}

// due_date(달력 날짜)가 범위에 드나 — 검색 레이어의 `due_date BETWEEN from AND to`를 인메모리로 미러.
function dueInRange(
  dueDate: string,
  range: { from: Date | null; to: Date },
): boolean {
  if (dueDate > isoDate(range.to)) {
    return false;
  }
  return range.from === null || dueDate >= isoDate(range.from);
}

describe("시간 경로 eval (가) — 구조화 경로가 q12·q13을 정확히 답한다", () => {
  for (const query of RELOCATED_TEMPORAL_QUERIES) {
    it(`${query.id} "${query.query}" — 기대 진술 정확히, 교란 배제`, () => {
      const token = TimeTokenSchema.parse(query.expectedToken);
      const range = resolveTimeToken(token, {
        reference: new Date(TEMPORAL_EVAL_QUERY_NOW),
        timeZone: EVAL_ZONE,
      });
      const retrieved = labeledCorpus
        .filter((statement) => dueInRange(statement.dueDate, range))
        .map((statement) => statement.id)
        .sort();
      expect(retrieved).toEqual([...query.expectedStatementIds].sort());
    });
  }
});

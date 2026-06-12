// 평가 지표의 순수 함수 — 러너(import 시 main이 도는 엔트리 스크립트)에서 분리해
// 단위 테스트가 가능하게 한다. 여기 함수들이 틀리면 모든 지표가 조용히 오염된다.

import { createHash } from "node:crypto";

/** 지표 반올림 배율 — 소수 3자리 */
const ROUND_SCALE = 1000;

export function round(value: number): number {
  return Math.round(value * ROUND_SCALE) / ROUND_SCALE;
}

export interface PrecisionRecallF1 {
  precision: number;
  recall: number;
  f1: number;
}

// 양쪽 0개(잡담 글에서 0개 추출)는 만점 — "추출 0개가 정답"인 케이스
export function scoreF1(counts: {
  matched: number;
  extracted: number;
  golden: number;
}): PrecisionRecallF1 {
  if (counts.extracted === 0 && counts.golden === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }
  const precision =
    counts.extracted === 0 ? 1 : counts.matched / counts.extracted;
  const recall = counts.golden === 0 ? 1 : counts.matched / counts.golden;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

// 골든 id("meeting-memo-1-s1")는 Qdrant point id(UUID)가 못 되므로 결정적 매핑
export function pointIdOf(goldenId: string): string {
  const h = createHash("sha1").update(goldenId).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

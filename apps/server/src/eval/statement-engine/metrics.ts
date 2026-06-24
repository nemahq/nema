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

interface ClassMetrics {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  support: number;
}

// 클래스별 P/R/F1 + macro-F1. accuracy는 다수 클래스에 눌려 소수 클래스 실패를 가리므로,
// macro(클래스 균등 가중)로 그 약점을 드러낸다. support(골든)도 예측도 0인 클래스는 제외 —
// 시험지에 없는 종류를 0으로 깎아 macro를 끌어내리지 않게.
export function classificationMetrics<T extends string>(
  classes: readonly T[],
  pairs: ReadonlyArray<{ expected: T; actual: T }>,
): { perClass: Record<T, ClassMetrics>; macroF1: number | null } {
  const perClass = Object.fromEntries(
    classes.map((cls) => {
      const truePositive = pairs.filter(
        (p) => p.expected === cls && p.actual === cls,
      ).length;
      const predicted = pairs.filter((p) => p.actual === cls).length;
      const support = pairs.filter((p) => p.expected === cls).length;
      if (support === 0 && predicted === 0) {
        return [cls, { precision: null, recall: null, f1: null, support }];
      }
      const precision = predicted === 0 ? 0 : truePositive / predicted;
      const recall = support === 0 ? 0 : truePositive / support;
      const f1 =
        precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall);
      return [
        cls,
        {
          precision: round(precision),
          recall: round(recall),
          f1: round(f1),
          support,
        },
      ];
    }),
  ) as Record<T, ClassMetrics>;
  const f1s = classes
    .map((cls) => perClass[cls].f1)
    .filter((f1): f1 is number => f1 !== null);
  const macroF1 =
    f1s.length === 0
      ? null
      : round(f1s.reduce((sum, value) => sum + value, 0) / f1s.length);
  return { perClass, macroF1 };
}

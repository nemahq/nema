// 관계 판정 채점의 순수 함수 — 러너(엔트리 스크립트)에서 분리해 단위 테스트가
// 가능하게 한다. 여기가 틀리면 모든 지표가 조용히 오염된다.
//
// 채점은 LLM 심판이 아니라 코드 정확 비교다: 예측 관계와 골든 관계 둘 다
// {from, to, type} 삼중쌍이고 끝점(진술 id)이 우리가 정해둔 값이라, 같은 뜻인지
// 해석할 게 없다 — 키가 일치하나만 본다. conflicts는 대칭이라 양끝을 정렬해 키를
// 만든다(워커 changeKey와 같은 규칙).

import type { RelationType } from "@nema-io/shared";

import {
  type PrecisionRecallF1,
  scoreF1,
} from "@server/eval/statement-engine/metrics";

export { round } from "@server/eval/statement-engine/metrics";

export interface RelationTriple {
  from: string;
  to: string;
  type: RelationType;
}

/** 게이트 통과 후의 예측 관계 — applied는 조용히 그래프행, pending은 사람 대기 */
export interface GatedRelation extends RelationTriple {
  gate: "applied" | "pending";
}

// 방향 포함 정체성 키 — conflicts만 대칭이라 양끝 정렬, 나머지는 방향 보존.
export function relationKey(triple: RelationTriple): string {
  return triple.type === "conflicts"
    ? `conflicts:${[triple.from, triple.to].sort().join(":")}`
    : `${triple.type}:${triple.from}:${triple.to}`;
}

// 방향 무시 키(같은 type·같은 끝점 쌍) — 방향만 틀린 예측을 잡아낸다.
function undirectedKey(triple: RelationTriple): string {
  return `${triple.type}:${[triple.from, triple.to].sort().join(":")}`;
}

/** 한 예측 관계의 판정 결과 */
type PredictionVerdict =
  | "true-positive" // 골든과 type·방향까지 일치
  | "direction-error" // type·끝점 쌍은 맞고 방향만 뒤집힘 (방향 있는 종류만)
  | "false-positive"; // 골든에 없음 — 지어낸 관계

interface ScoredPrediction {
  prediction: GatedRelation;
  verdict: PredictionVerdict;
}

export interface ScoreResult {
  scored: ScoredPrediction[];
  /** 골든인데 type·방향까지 맞게 잡히지 못한 것 (방향만 틀린 것도 포함) */
  missedGolden: RelationTriple[];
  counts: {
    truePositive: number;
    directionError: number;
    falsePositive: number;
    missed: number;
  };
}

// 예측(게이트 통과분)을 골든과 대조한다. 닫힌 세계: 골든에 없는 예측은 FP.
// direction-error는 TP도 FP도 아닌 별도 버킷 — 방향이 꺼내기 표식을 좌우하므로
// "관계는 봤으나 방향이 틀린" 경우를 "완전히 지어낸" FP와 섞지 않는다.
export function scorePredictions(params: {
  predictions: GatedRelation[];
  golden: RelationTriple[];
}): ScoreResult {
  const { predictions, golden } = params;

  const goldenByKey = new Map(golden.map((g) => [relationKey(g), g]));
  // 방향 무시 키 → 골든들 (방향 있는 종류만; conflicts는 relationKey가 이미 대칭)
  const goldenByUndirected = new Map<string, RelationTriple[]>();
  for (const g of golden) {
    if (g.type === "conflicts") {
      continue;
    }
    const list = goldenByUndirected.get(undirectedKey(g)) ?? [];
    list.push(g);
    goldenByUndirected.set(undirectedKey(g), list);
  }

  const matchedGoldenKeys = new Set<string>();
  const directionMatchedGoldenKeys = new Set<string>();

  const scored: ScoredPrediction[] = predictions.map((prediction) => {
    const exactKey = relationKey(prediction);
    if (goldenByKey.has(exactKey) && !matchedGoldenKeys.has(exactKey)) {
      matchedGoldenKeys.add(exactKey);
      return { prediction, verdict: "true-positive" as const };
    }
    if (prediction.type !== "conflicts") {
      const candidates =
        goldenByUndirected.get(undirectedKey(prediction)) ?? [];
      const unclaimed = candidates.find(
        (g) =>
          !matchedGoldenKeys.has(relationKey(g)) &&
          !directionMatchedGoldenKeys.has(relationKey(g)),
      );
      if (unclaimed) {
        directionMatchedGoldenKeys.add(relationKey(unclaimed));
        return { prediction, verdict: "direction-error" as const };
      }
    }
    return { prediction, verdict: "false-positive" as const };
  });

  const missedGolden = golden.filter(
    (g) =>
      !matchedGoldenKeys.has(relationKey(g)) &&
      !directionMatchedGoldenKeys.has(relationKey(g)),
  );

  const truePositive = scored.filter(
    (s) => s.verdict === "true-positive",
  ).length;
  const directionError = scored.filter(
    (s) => s.verdict === "direction-error",
  ).length;
  const falsePositive = scored.filter(
    (s) => s.verdict === "false-positive",
  ).length;

  return {
    scored,
    missedGolden,
    counts: {
      truePositive,
      directionError,
      falsePositive,
      missed: missedGolden.length,
    },
  };
}

// 정밀도/재현율: direction-error는 TP가 아니다 — 예측 분모엔 남아 정밀도를 깎고,
// 골든은 미회수라 재현율도 깎는다(방향 틀린 관계는 화면 표식이 거꾸로 나가므로
// 절반의 성공으로 봐주지 않는다). 양쪽 0개(침묵해야 할 묶음에서 0개 예측)는 만점.
export function precisionRecall(counts: {
  truePositive: number;
  predicted: number;
  golden: number;
}): PrecisionRecallF1 {
  return scoreF1({
    matched: counts.truePositive,
    extracted: counts.predicted,
    golden: counts.golden,
  });
}

/** 중복(같음) 쌍 — "같음"은 대칭이라 끝점 순서를 무시하고 맞춘다 */
export interface DuplicatePair {
  a: string;
  b: string;
}

function duplicateKey(pair: DuplicatePair): string {
  return [pair.a, pair.b].sort().join("|");
}

export interface DuplicateScore {
  matched: number;
  predicted: number;
  expected: number;
  /** 골든에 없는 예측 = 과합치(가장 위험한 오류 — 서로 다른 사실을 한 벌로 뭉갬) */
  falsePositives: DuplicatePair[];
  /** 골든인데 못 잡은 것 */
  missed: DuplicatePair[];
}

// 중복 채점 — 관계와 별개. 끝점 쌍을 정렬해 방향 무시로 맞추고, 골든 하나는 한 번만 회수.
export function scoreDuplicates(params: {
  predicted: DuplicatePair[];
  expected: DuplicatePair[];
}): DuplicateScore {
  const { predicted, expected } = params;
  const expectedByKey = new Map(expected.map((p) => [duplicateKey(p), p]));
  const claimed = new Set<string>();
  const falsePositives: DuplicatePair[] = [];

  for (const pair of predicted) {
    const key = duplicateKey(pair);
    if (expectedByKey.has(key) && !claimed.has(key)) {
      claimed.add(key);
    } else {
      falsePositives.push(pair);
    }
  }

  const missed = expected.filter((p) => !claimed.has(duplicateKey(p)));

  return {
    matched: claimed.size,
    predicted: predicted.length,
    expected: expected.length,
    falsePositives,
    missed,
  };
}

interface TypeTally {
  truePositive: number;
  falsePositive: number;
  missed: number;
  directionError: number;
}

// 관계 종류별 집계 — supports precision이 헤드라인(지어낸 supports = supports FP).
export function tallyByType(results: ScoreResult[]): Record<string, TypeTally> {
  const tally: Record<string, TypeTally> = {};
  const ensure = (type: string): TypeTally =>
    (tally[type] ??= {
      truePositive: 0,
      falsePositive: 0,
      missed: 0,
      directionError: 0,
    });

  for (const result of results) {
    for (const { prediction, verdict } of result.scored) {
      const entry = ensure(prediction.type);
      if (verdict === "true-positive") {
        entry.truePositive += 1;
      } else if (verdict === "direction-error") {
        entry.directionError += 1;
      } else {
        entry.falsePositive += 1;
      }
    }
    for (const missed of result.missedGolden) {
      ensure(missed.type).missed += 1;
    }
  }

  return tally;
}

// 게이트 통과 FP — confident라 조용히 applied된 지어낸 관계가 가장 해롭다.
// (conflicts는 게이트가 늘 pending이라 applied FP는 supports/replaces/resolves뿐.)
export function appliedFalsePositives(results: ScoreResult[]): GatedRelation[] {
  return results.flatMap((result) =>
    result.scored
      .filter(
        (s) =>
          s.verdict === "false-positive" && s.prediction.gate === "applied",
      )
      .map((s) => s.prediction),
  );
}

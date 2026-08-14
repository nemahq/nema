import type { DigestRelationType, DigestType } from "@nema-io/shared";
import { DIGEST_RELATION_TYPES, DIGEST_TYPES } from "@nema-io/shared";

// =============================================================
// 관계 판정의 표.
//
// 흐름(digest-relation-service)은 이 표를 읽어서 돌 뿐 다이제스트 유형이나 관계
// 종류로 분기하지 않는다. 유형이 늘거나(여섯째 유형) 관계 종류가 늘 때(중복·충돌·해소)
// 흐름을 안 열기 위해서다 — engine/linking.md 2.1 "흐름은 하나고, 다이제스트
// 유형마다 다른 것은 조합해서 쓴다".
//
// 받아들이는 기준: 유형이나 관계 종류를 하나 더할 때, 이 파일에 줄만 늘고
// digest-relation-service.ts는 안 바뀌어야 한다.
// =============================================================

/**
 * 신규 다이제스트와 후보 중 누가 관계의 하는 쪽(from)인가.
 *
 * 유형이 다르면 받는 쪽이 늘 결정이라 방향이 논리적으로 확정된다("결정이 학습을
 * 지지한다"는 성립하지 않는다). 둘 다 결정일 때만 유형으로 못 가르는데, 이때
 * 시간순으로 추측하면 안 된다 — 지지는 먼저 정한 것이 나중 것의 근거가 되어 앞→뒤,
 * 약화는 새 결정이 기존을 흔들어 뒤→앞이라 방향이 서로 반대다. 두 다이제스트를 이미
 * 다 읽고 있는 판정 LLM이 답하는 게 정확하고 거의 공짜다.
 */
export type RelationDirection = "newIsFrom" | "candidateIsFrom" | "llmDecides";

/** 신규 유형 × 후보 유형 한 칸. null이면 그 쌍은 후보로 아예 안 본다. */
export interface RelationPairRule {
  direction: RelationDirection;
  /** 이 쌍에 걸릴 수 있는 관계 종류. 아이디어처럼 한쪽만 되는 자리가 있다. */
  types: readonly DigestRelationType[];
}

/**
 * 갈래 이름. 이 값이 relation_judgments.judgment로 그대로 나가 문턱을 갈래별로 볼 때의
 * 조인 키가 된다 — 오타 하나가 점수 분포를 조용히 둘로 쪼개므로 열어두지 않는다.
 */
export type RelationJudgmentName = "support_weaken" | "duplicate_conflict";

/**
 * 한 판정에서 함께 갈리는 관계 종류 묶음(= 갈래). 갈래 하나가 LLM에게 던지는 질문
 * 하나이고, 안에 든 관계 종류는 그 질문의 답 선택지다.
 *
 * 종류마다 따로 묻지 않는 이유는 배타성이다 — "중복인가"와 "충돌인가"를 따로 물으면
 * 같은 상황을 다룬 두 결정에 둘 다 예가 나올 수 있는데, 한 쌍에 관계는 하나다.
 * 한 번에 물으면 선택지 중 하나만 고르므로 배타성이 구조로 보장된다.
 */
export interface RelationJudgment {
  /**
   * 로그에 남길 갈래 이름(relation_judgments.judgment). 문턱을 나중에 갈래별로
   * 나누려면 점수 분포가 섞이면 안 되는데, verdict 대부분이 none이라 이 이름이
   * 없으면 어느 질문에 대한 none인지 구별이 안 된다.
   */
  name: RelationJudgmentName;
  /** 신규 유형(행) × 후보 유형(열) → 방향과 관계 종류. 곧 유형별 후보 범위이기도 하다. */
  pairs: Record<DigestType, Record<DigestType, RelationPairRule | null>>;
  /** 같은 원문 안 다이제스트를 후보로 볼지. */
  sameSourceScope: SameSourceScope;
  /** 판정할 때 LLM에게 묻는 말. 프롬프트의 나머지(틀·출력 형식)는 갈래와 무관하다. */
  question: string;
}

/**
 * earlierOnly — 같은 원문 안에서 자기보다 앞선 것만 본다. 다이제스트마다 판정을 열면
 * 같은 쌍을 두 번 보게 되고(A의 판정에서 B를, B의 판정에서 다시 A를), LLM이
 * 비결정적이라 두 판정이 어긋날 수 있다. 다른 원문끼리는 이 문제가 없다 — 기존
 * 다이제스트는 판정이 다시 안 열린다.
 * exclude — 같은 원문 안을 아예 안 본다(중복·충돌·해소가 여기 걸린다, linking.md 2.3).
 */
export type SameSourceScope = "earlierOnly" | "exclude";

const SUPPORT_OR_WEAKEN = [
  "support",
  "weaken",
] as const satisfies readonly DigestRelationType[];
// 아이디어는 약화에서 빠진다 — 아직 판단 전이라 무엇도 무너뜨리지 못한다.
// 채택되면 지지가 되는 것과 대비된다(linking.md 2.1).
const SUPPORT_ONLY = [
  "support",
] as const satisfies readonly DigestRelationType[];

const NEW_GIVES: RelationPairRule = {
  direction: "newIsFrom",
  types: SUPPORT_OR_WEAKEN,
};
const CANDIDATE_GIVES: RelationPairRule = {
  direction: "candidateIsFrom",
  types: SUPPORT_OR_WEAKEN,
};

// 미결이 어느 쪽에도 안 붙는 줄 — 질문은 아무것도 뒷받침하거나 무너뜨리지 못하고,
// 무엇도 질문을 뒷받침하지 않는다. 미결이 이어지는 길은 해소뿐이다(linking.md 2.1).
const NO_CANDIDATE = {
  decision: null,
  pending: null,
  learning: null,
  idea: null,
  assumption: null,
} as const satisfies Record<DigestType, RelationPairRule | null>;

export const SUPPORT_WEAKEN_JUDGMENT: RelationJudgment = {
  name: "support_weaken",
  pairs: {
    // 신규가 결정이면 기존 전부를 본다 — 결정은 받는 쪽이 될 수도, 다른 결정을
    // 지지·약화하는 쪽이 될 수도 있다.
    decision: {
      decision: { direction: "llmDecides", types: SUPPORT_OR_WEAKEN },
      learning: CANDIDATE_GIVES,
      assumption: CANDIDATE_GIVES,
      idea: { direction: "candidateIsFrom", types: SUPPORT_ONLY },
      pending: null,
    },
    // 신규가 학습·가정·아이디어면 기존 결정만 본다 — 받는 쪽이 늘 결정이라
    // 결정 아닌 것끼리는 대볼 이유가 없다.
    learning: { ...NO_CANDIDATE, decision: NEW_GIVES },
    assumption: { ...NO_CANDIDATE, decision: NEW_GIVES },
    idea: {
      ...NO_CANDIDATE,
      decision: { direction: "newIsFrom", types: SUPPORT_ONLY },
    },
    pending: NO_CANDIDATE,
  },
  sameSourceScope: "earlierOnly",
  question: `A relation here is one digest standing under a DECISION — holding it up, or
pulling the ground out from under it. The receiving end is always a decision.

- support: the giving side is ground the decision stands on. Remove it and the
  decision loses its footing: the fact it was based on, the belief it assumed,
  the idea it adopted, the earlier decision it follows from.
- weaken: the giving side takes ground away. What the decision stood on is gone,
  or what has been found makes the decision unworkable.
- none: everything else.

Answer "none" unless the relation is plain. Two digests about the same project,
the same feature, the same week are NOT related — sharing a subject is not
standing under something. If you find yourself explaining a chain of steps to
get from one to the other, it is "none". A wrong link is worse than a missing
one: the user is later told "this is what your decision rests on" and it is not.`,
};

const DUPLICATE_OR_CONFLICT = [
  "duplicate",
  "conflict",
] as const satisfies readonly DigestRelationType[];
// 미결과 아이디어는 충돌에서 빠진다 — 질문끼리는 부딪히지 않고(같은 것을 물으면
// 그건 중복이다), 발상은 아직 판단 전이라 부딪힐 게 없다(linking.md 2.1).
const DUPLICATE_ONLY = [
  "duplicate",
] as const satisfies readonly DigestRelationType[];

// 중복·충돌은 같은 유형끼리만 본다. 유형이 다르면 주된 칸이 말하는 것도 달라서
// "같은 말인가 / 다른 선택인가"를 물을 수가 없다. 유형을 가로질러 부딪히는
// 경우(결정↔학습 등)는 지지·약화 표가 받는 쪽을 늘 결정으로 두어 약화로 이미 잡는다.
function sameTypeOnly(
  newType: DigestType,
  types: readonly DigestRelationType[],
): Record<DigestType, RelationPairRule | null> {
  return {
    ...NO_CANDIDATE,
    // 방향은 LLM에게 안 묻는다 — 중복·충돌은 논리적으로 대칭이라 "새로 온 쪽이 이미
    // 쌓인 쪽을 대체하는 방향"으로 고정하면 그만이다(linking.md 2.2 "뒤늦게 몰아서
    // 다시 잇지 않는다"). 지지·약화에서 둘 다 결정일 때 물었던 것과 갈리는 대목이다.
    [newType]: { direction: "newIsFrom", types },
  };
}

export const DUPLICATE_CONFLICT_JUDGMENT: RelationJudgment = {
  name: "duplicate_conflict",
  pairs: {
    decision: sameTypeOnly("decision", DUPLICATE_OR_CONFLICT),
    learning: sameTypeOnly("learning", DUPLICATE_OR_CONFLICT),
    assumption: sameTypeOnly("assumption", DUPLICATE_OR_CONFLICT),
    idea: sameTypeOnly("idea", DUPLICATE_ONLY),
    pending: sameTypeOnly("pending", DUPLICATE_ONLY),
  },
  // 같은 원문 안은 아예 안 본다. 한 번에 던진 대화 안에서 두 장이 비슷한 건 정리
  // 단계의 문제이고, 여기가 잡을 건 다른 날 던진 것과 부딪히는 것이다. 그래서 쌓이기
  // 전에는 관계가 거의 안 뜬다 — 0으로 나와도 문턱·상한부터 의심할 자리가 아니다.
  sameSourceScope: "exclude",
  question: `Both digests are the same type here, and a relation means they are about the
same thing. Compare only the main field — the one that carries the judgment:

- decision: "choice"      - learning: "finding"    - assumption: "assumption"
- idea: "concept"         - pending: "question"

Everything else (situation, background, reason, evidence, tradeoff, impact) is
context. Two digests sharing context is not a relation.

Decide in two steps.

1. Do the two main fields address the same thing — the same call to make, the
   same claim, the same question? If not, answer "none" and stop.
2. If they do, do they say the same thing?
   - duplicate: they say the same. The new digest adds nothing the stored one
     does not already have.
   - conflict: they say different things and cannot both hold.

The common mistake is calling two digests duplicates because they share a
situation. Two decisions made in the same situation that took DIFFERENT options
are a conflict, not a duplicate — read the choice, not the setup.

The other mistake is treating a shared subject as "the same thing". Two
decisions about deployment, two findings about the same service, two questions
about the same feature are NOT related unless the main fields actually meet.
Answer "none" unless the overlap is plain. A wrong link is worse than a missing
one: the user is later told "you already decided this" and they did not.`,
};

/**
 * 이 판정이 낼 수 있는 관계 종류 — 프롬프트의 선택지와 응답 스키마가 여기서 나온다.
 * 표에서 뽑아내므로 표와 어긋날 수가 없다. 순서는 DIGEST_RELATION_TYPES를 따라
 * 호출마다 같다.
 */
export function relationTypesOf(
  judgment: RelationJudgment,
): DigestRelationType[] {
  const used = new Set(
    DIGEST_TYPES.flatMap((newType) =>
      DIGEST_TYPES.flatMap(
        (candidateType) => judgment.pairs[newType][candidateType]?.types ?? [],
      ),
    ),
  );
  return DIGEST_RELATION_TYPES.filter((type) => used.has(type));
}

/** 이 유형의 신규 다이제스트가 후보로 볼 수 있는 유형들. 비면 판정 자체를 안 연다. */
export function candidateTypesOf(
  judgment: RelationJudgment,
  newType: DigestType,
): DigestType[] {
  return DIGEST_TYPES.filter(
    (candidateType) => judgment.pairs[newType][candidateType] !== null,
  );
}

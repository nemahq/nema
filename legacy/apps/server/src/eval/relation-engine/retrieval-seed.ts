// 관계 후보 좁히기 ⓐ(벡터 근접) 측정용 씨앗 — NEM-165.
// 코퍼스는 harness-scenarios.md 글 A~D 본문을 프로덕션 추출(gpt-5)로 1회 통과시킨
// 실제 진술 스냅샷이다(㉠ 방식 — 합성 골든이 아니라 앱이 뱉은 표현 위에서 재므로
// 추출 표현차가 벡터 거리에 주는 영향까지 잡힌다). 추출은 비결정적이라 한 번 떠서 얼렸다.
// 골든 쌍은 harness-scenarios.md 관계 정답을 이 스냅샷의 실제 진술 id에 매핑한 것.

type StatementType = "claim" | "question";
type StatementConfidence = "certain" | "guess";

interface RetrievalStatement {
  id: string;
  /** 투입 단위(글) — 같은 글 형제는 ⓑ가 잡으므로 ⓐ 후보에서 제외된다 */
  article: string;
  content: string;
  type: StatementType;
  confidence: StatementConfidence | null;
}

/** 투입 순서 — 새 진술 질의 시점에 이 순서로 앞 글들만 코퍼스에 있다 */
export const RETRIEVAL_ARTICLES = ["A", "B", "C", "D"] as const;

export const RETRIEVAL_CORPUS: RetrievalStatement[] = [
  {
    id: "A.0",
    article: "A",
    content: "B2C 스타트업은 구조적으로 불리하다고 결론지었다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.1",
    article: "A",
    content: "B2C의 실패율은 B2B보다 높다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.2",
    article: "A",
    content: "이커머스 기준으로 B2C의 실패율은 약 80퍼센트에 이른다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.3",
    article: "A",
    content: "B2C에서는 시장 수요를 검증하기 어렵다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.4",
    article: "A",
    content: "B2C 사용자는 자기 문제를 잘 인식하거나 표현하지 못한다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.5",
    article: "A",
    content: "B2C에서는 좋아요와 실제 결제 사이의 간극이 B2B보다 넓다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.6",
    article: "A",
    content: "B2C에서는 수익화가 빠듯하다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.7",
    article: "A",
    content: "B2C의 객단가가 낮다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.8",
    article: "A",
    content: "B2C에서 의미 있는 매출을 내려면 수만 명 규모의 사용자가 필요하다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.9",
    article: "A",
    content: "B2C에서는 무료에 익숙한 사용자가 많다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.10",
    article: "A",
    content: "B2C의 유료 전환율은 대체로 2에서 5퍼센트 수준에 머문다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.11",
    article: "A",
    content: "B2C에서는 유지가 약하다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.12",
    article: "A",
    content: "B2C에서 앱을 지우고 대안으로 옮기는 비용이 거의 없다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.13",
    article: "A",
    content: "B2C의 30일 유지율은 보통 10퍼센트 안팎에 그친다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.14",
    article: "A",
    content:
      "B2C에서는 사용자를 모으는 데 돈이 들고, 모아도 빠져나가며 남은 사람도 돈을 잘 내지 않는 악순환이 발생한다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "A.15",
    article: "A",
    content:
      "B2C가 되려면 광고비 없이 사용자가 알아서 들어오는 바이럴 성장 또는 들어온 사용자를 붙드는 강한 습관 형성 중 하나는 갖춰야 한다고 본다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "B.0",
    article: "B",
    content: "B2C가 구조적으로 불리하다는 점은 인정했다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.1",
    article: "B",
    content: "모든 B2C가 똑같이 어렵지는 않다고 본다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "B.2",
    article: "B",
    content:
      "공백이 크거나 습관이 자연히 생기는 좁은 B2C 영역은 해볼 만하다고 판단했다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.3",
    article: "B",
    content: "그 기준으로 B2C 후보를 추렸다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.4",
    article: "B",
    content: "지금 보고 있는 B2C 후보는 네 가지다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.5",
    article: "B",
    content: "후보 중 하나는 N잡 수익 관리다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.6",
    article: "B",
    content: "N잡 수익 관리에서는 플랫폼마다 정산 주기가 다르다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.7",
    article: "B",
    content: "N잡 수익 관리에서는 플랫폼마다 세금 기준이 다르다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.8",
    article: "B",
    content: "N잡 수익 관리에서는 수입 파악이 번거롭다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.9",
    article: "B",
    content: "N잡 수익 관리는 매달 반복되는 일이라 습관이 붙기 쉬워 보인다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "B.10",
    article: "B",
    content: "후보 중 하나는 건강 자기관리다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.11",
    article: "B",
    content:
      "건강 자기관리에서는 웨어러블로 데이터가 자동으로 쌓이는 흐름이 있다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.12",
    article: "B",
    content: "건강 자기관리는 가능성이 있어 보인다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "B.13",
    article: "B",
    content: "후보 중 하나는 1인가구 생활관리다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.14",
    article: "B",
    content: "1인가구 생활관리 시장은 넓다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.15",
    article: "B",
    content: "1인가구 생활관리 시장에는 아직 뚜렷한 강자가 보이지 않는다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.16",
    article: "B",
    content: "후보 중 하나는 예체능·크리에이터 영역이다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.17",
    article: "B",
    content: "예체능·크리에이터 영역은 단독으로는 시장이 작다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.18",
    article: "B",
    content: "예체능·크리에이터 영역은 프리랜서나 1인가구로 넓혀갈 여지가 있다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "B.19",
    article: "B",
    content: "아직 B2C 후보를 하나로 좁히지 못했다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "B.20",
    article: "B",
    content: "N잡 수익 관리와 건강 자기관리 중 무엇을 먼저 검증할 것인가?",
    type: "question",
    confidence: null,
  },
  {
    id: "B.21",
    article: "B",
    content: "당장은 N잡 수익 관리와 건강 자기관리를 함께 들여다본다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.0",
    article: "C",
    content: "후보 네 개를 다시 따져보니 순위가 분명히 갈렸다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.1",
    article: "C",
    content: "1인가구 생활관리는 접기로 했다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.2",
    article: "C",
    content:
      "1인가구 생활관리를 접은 이유는 두잇이 이미 같은 방향으로 자금과 팀을 갖추고 들어와 있고 후발 주자가 그걸 뒤집을 만한 뚜렷한 지점이 보이지 않으며 시장이 넓다는 매력만으로는 부족하다고 판단했기 때문이다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.3",
    article: "C",
    content: "남은 후보 중에서는 N잡 수익 관리가 가장 앞선다고 본다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "C.4",
    article: "C",
    content:
      "N잡 수익 관리가 가장 앞선다고 본 이유는 공백이 분명하고 검증 난이도도 낮은 편이기 때문이다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.5",
    article: "C",
    content: "건강 자기관리는 차순위로 둔다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "C.6",
    article: "C",
    content:
      "건강 자기관리를 차순위로 둔 이유는 웨어러블 흐름이 아직 진행 중이라 지금이 뛰어들 타이밍인지 확신이 덜하기 때문이다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "D.0",
    article: "D",
    content: "검증 대상을 N잡 수익 관리로 확정했다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.1",
    article: "D",
    content: "검증 기간은 최대 3개월로 잡았다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.2",
    article: "D",
    content:
      "성공 기준은 다섯 명이 매월 정산 데이터를 보내고 내가 정리한 수입 리포트와 세금 예측을 두 달 넘게 반복해서 받는 상태가 되는 것이다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.3",
    article: "D",
    content: "건강 자기관리는 2순위로 둔다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.4",
    article: "D",
    content: "N잡과 건강 자기관리를 병행하지 않는다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.5",
    article: "D",
    content: "N잡이 실패하면 건강 자기관리로 넘어간다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.6",
    article: "D",
    content:
      "N잡과 건강 자기관리를 병행하지 않는 이유는 두 검증 방식이 완전히 달라 동시에 하면 둘 다 얕아지기 때문이고, 건강 시장은 당장 사라지지 않기 때문이며, 공백 문제가 품질 부족 문제보다 더 절실하기 때문이다",
    type: "claim",
    confidence: "certain",
  },
  {
    id: "D.7",
    article: "D",
    content: "N잡이 B2C인데도 해볼 만하다고 본다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "D.8",
    article: "D",
    content:
      "N잡이 B2C인데도 해볼 만하다고 보는 이유는 정산 데이터를 매달 보내는 행동이 자연히 반복되어 습관으로 자리잡기 때문이다",
    type: "claim",
    confidence: "guess",
  },
  {
    id: "D.9",
    article: "D",
    content: "광고 집행 없이도 한번 습관이 자리잡은 사용자는 매달 돌아온다",
    type: "claim",
    confidence: "guess",
  },
];

type RelationKind = "conflicts" | "replaces" | "resolves" | "supports";

/** older = 앞 글의 진술(후보), newer = 뒤 글의 진술(질의). retrieval이 잡아야 할 진짜 쌍. */
interface RetrievalGoldPair {
  older: string;
  newer: string;
  kind: RelationKind;
  note?: string;
}

export const RETRIEVAL_GOLD_PAIRS: RetrievalGoldPair[] = [
  {
    older: "B.13",
    newer: "C.1",
    kind: "replaces",
    note: "1인가구 후보 → 접기",
  },
  {
    older: "B.15",
    newer: "C.2",
    kind: "conflicts",
    note: "강자 없다 ↔ 두잇이 선점 (유일 충돌 양성)",
  },
  {
    older: "B.21",
    newer: "D.4",
    kind: "replaces",
    note: "병행 검토 → 병행 안 함",
  },
  {
    older: "B.20",
    newer: "D.0",
    kind: "resolves",
    note: "무엇 먼저 검증할지 → N잡 확정",
  },
  {
    older: "A.15",
    newer: "D.7",
    kind: "supports",
    note: "습관 형성 필요 → N잡은 습관 덕에 해볼 만",
  },
  {
    older: "B.2",
    newer: "D.7",
    kind: "supports",
    note: "좁은 영역이면 해볼 만 → N잡 해볼 만",
  },
];

/** 관계가 없어야 하는데 뜻이 가까워 retrieval이 끌어올 수 있는 쌍 — 거짓 supports·충돌의 먹이 */
interface RetrievalTrapPair {
  older: string;
  newer: string;
  note: string;
}

export const RETRIEVAL_TRAP_PAIRS: RetrievalTrapPair[] = [
  {
    older: "A.0",
    newer: "D.7",
    note: "거짓충돌: 일반론(B2C 어렵다) vs 조건부(N잡은 해볼 만)",
  },
  { older: "A.0", newer: "B.2", note: "거짓충돌: 일반론 vs 조건부" },
  {
    older: "C.3",
    newer: "D.0",
    note: "near-duplicate: N잡 가장 앞선다 ↔ N잡 확정",
  },
];

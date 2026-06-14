// 관계 엔진(save-engine-v2 ③단계) 판정 평가용 씨앗 데이터
// 설계: docs/flows/save-engine-v2/relation-design.md §5(판정·게이트)
//
// 한 시나리오 = 새 진술 배치(role:"new") + 기존 후보(role:"existing") + 그 사이에
// 성립하는 골든 관계의 "전수". 골든은 닫힌 세계(closed-world)다 — 골든에 없는
// 예측 관계는 전부 FP(지어냄)로 친다. 따라서 진술 세트를 작게·통제해 관계를
// 빠짐없이 적을 수 있게 짠다.
//
// 후보 좁히기(벡터 근접·형제)는 이 평가가 건드리지 않는다 — existing 진술을 직접
// 공급해 "판정" 프롬프트만 격리 측정한다(eval-design 결정 #1과 같은 결, 후보 K·
// 점수 하한은 relation-design §11이 dogfooding으로 미룬 값).
//
// 골든은 고정 정답이 아니라 씨앗이다 — 엔진이 골든에 없는 "진짜" 관계를 찾으면
// 코드는 FP로 깎지만, 러너가 실패 사례를 원문째 남겨 사람이 골든을 보정한다.

import type { RelationType } from "@nema-io/shared";

type StatementType = "claim" | "question" | "todo";
type StatementConfidence = "certain" | "guess";

/** 시나리오 안에서만 유효한 진술 id (골든 관계가 참조) */
interface ScenarioStatementBase {
  id: string;
  content: string;
  /** "new" = 이번에 들어온 배치, "existing" = 기존 후보 (워커의 N/E 라벨에 대응) */
  role: "new" | "existing";
}

/** schema-design 4.2의 CHECK(claim이면 확신도 필수, 그 외 금지)를 타입으로 강제 */
export type ScenarioStatement =
  | (ScenarioStatementBase & {
      type: "claim";
      confidence: StatementConfidence;
    })
  | (ScenarioStatementBase & {
      type: Exclude<StatementType, "claim">;
      confidence?: never;
    });

export interface GoldenRelation {
  /** 시나리오 진술 id */
  from: string;
  to: string;
  type: RelationType;
  /** 이 관계가 왜 성립하나 (실패 사례 검토용 사람 메모) */
  note?: string;
}

/** 이 시나리오가 노리는 함정 (함정별 실패 집계용) */
export type RelationTrap =
  | "invented-supports" // 토픽이 가까운 사실을 근거랍시고 지어내 supports로 잇나
  | "false-conflict" // 안 부딪히는 두 진술을 충돌이라 하나
  | "contention-not-alternation" // 교대 선언 없는 경합을 replaces로 오판하나
  | "mere-neighbor"; // 뜻만 가까운 무관계 쌍에 관계를 다나

export interface RelationScenario {
  id: string;
  description: string;
  /** 이 시나리오가 시험하는 함정 — golden이 비거나 함정 진술을 품은 이유 */
  traps: RelationTrap[];
  statements: ScenarioStatement[];
  /** 이 진술들 사이 성립하는 관계의 전수 (없으면 빈 배열 = "엔진은 침묵해야") */
  golden: GoldenRelation[];
  note?: string;
}

// ---------------------------------------------------------------------------
// 시나리오
//
// 핵심 실패 모드가 과연결(특히 지어낸 supports)이라 함정이 본체다. 진짜 관계 4종은
// 엔진이 맞춰야 하고, 함정은 엔진이 "관계 없음"이라 해야 한다. 한 시나리오에 진짜 +
// 함정을 섞어 둔다 — 실제 워커도 진술 묶음을 통째로 보고 판정하기 때문.
// ---------------------------------------------------------------------------

export const RELATION_SCENARIOS: RelationScenario[] = [
  {
    id: "supports-same-note",
    description:
      "같은 글 안의 결정+근거(둘 다 new)를 supports로 잇나 + 토픽만 겹치는 형제는 무관계로 두나",
    traps: ["mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제 연동은 토스페이먼츠로 가기로 했다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "토스페이먼츠를 택한 이유는 출시 일정이 급해서다",
      },
      {
        id: "s3",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제 모듈 코드 리뷰는 김 대리가 맡는다",
      },
    ],
    golden: [
      {
        from: "s2",
        to: "s1",
        type: "supports",
        note: "근거(출시 급함)가 결정(토스)을 받친다 — 본문이 '이유는'으로 명시",
      },
    ],
    note: "s3은 '결제' 키워드만 겹치는 형제 — 관계 없음",
  },
  {
    id: "invented-supports-dogfood",
    description:
      "도그푸딩 실패 재현: 진짜 이유는 따로 있는데(정산 리포트), 토픽 가까운 수수료 사실을 근거로 지어내나",
    traps: ["invented-supports"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제 연동을 토스에서 포트원으로 바꾸기로 했다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "토스를 접는 이유는 정산 리포트 기능이 약해서다",
      },
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "포트원은 결제 수수료가 토스보다 0.3%p 높다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제 연동은 토스로 한다",
      },
    ],
    golden: [
      {
        from: "s2",
        to: "s1",
        type: "supports",
        note: "본문이 명시한 진짜 이유(정산 리포트 약함)만 근거",
      },
      {
        from: "s1",
        to: "e2",
        type: "replaces",
        note: "토스→포트원 교대를 '바꾸기로'로 명시 — e2(옛 결정)를 갈아치움",
      },
    ],
    note: "e1(수수료)은 포트원의 단점이지 전환의 근거가 아니다 — e1을 s1의 supports로 잇는 게 1순위 FP",
  },
  {
    id: "replaces-vs-contention",
    description:
      "교대 선언이 뚜렷한 건 replaces, 교대 없이 어긋나기만 한 건 conflicts로 가르나",
    traps: ["contention-not-alternation"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "이제부터 배포는 매주 화요일에 한다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "QA는 배포 전날까지 끝내야 한다",
      },
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "배포는 매주 목요일에 한다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "QA는 배포 당일 오전에 진행한다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "replaces",
        note: "'이제부터'로 교대 명시 — 목요일 배포를 화요일이 갈아치움",
      },
      {
        from: "s2",
        to: "e2",
        type: "conflicts",
        note: "전날 vs 당일 오전 — 둘 다 유효 주장, 교대 선언 없음 → 경합",
      },
    ],
    note: "s2/e2를 replaces로 단정하면 멀쩡히 유효한 e2를 '지난 것'으로 숨김 — 오판",
  },
  {
    id: "resolves-question",
    description: "결정 진술이 열린 질문을 닫나(resolves) + 토픽 형제는 무관계",
    traps: ["mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "question",
        content: "구독 가격을 월 9,900원으로 할까?",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "구독 가격은 월 12,000원으로 확정했다",
      },
      {
        id: "s2",
        role: "new",
        type: "todo",
        content: "랜딩 페이지에 가격표를 넣어야 한다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "resolves",
        note: "가격 확정(12,000원)이 열린 가격 질문을 닫는다",
      },
    ],
    note: "s2는 '가격' 키워드만 겹치는 할 일 — 질문을 닫지 않음",
  },
  {
    id: "resolves-todo",
    description: "완료 진술이 열린 할 일을 닫나(resolves) + 토픽 형제는 무관계",
    traps: ["mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "todo",
        content: "온보딩 문서 초안을 작성해야 한다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "온보딩 문서 초안을 완성했다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "온보딩 이메일은 3통으로 구성한다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "resolves",
        note: "초안 완성이 '초안 작성' 할 일을 닫는다",
      },
    ],
    note: "e2는 '온보딩' 키워드만 겹침 — 무관계",
  },
  {
    id: "silence-no-relation",
    description:
      "뜻은 가까운데 아무 관계도 없는 진술 묶음 — 엔진은 침묵해야(가장 흔한 실제 상황)",
    traps: ["false-conflict", "mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "검색 속도 개선을 다음 스프린트 1순위로 둔다",
      },
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "모바일 지원을 다음 분기 목표로 잡았다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "검색 인덱싱은 야간 배치로 돈다",
      },
    ],
    golden: [],
    note: "셋 다 로드맵·검색 토픽으로 가깝지만 서로 받치지도 부딪히지도 않는다 — 무엇이든 내면 FP",
  },
  {
    id: "conflicts-clean",
    description:
      "교대 없이 양립 불가한 두 주장을 conflicts로 잡나 + 형제 무관계",
    traps: ["mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "인증은 자체 구현으로 간다",
      },
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "인증은 Supabase Auth를 쓴다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "로그인 화면 리디자인이 필요하다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "conflicts",
        note: "자체 구현 vs Supabase Auth — 둘 다 현재 인증 방식이라 주장, 교대 선언 없음",
      },
    ],
    note: "e2는 '인증/로그인' 토픽 형제 — 관계 없음. s1/e1을 replaces로 단정하면 안 됨(교대 미선언)",
  },
  {
    id: "supports-new-to-existing",
    description:
      "새 근거가 기존 결정을 받치나(new→existing supports) + 완전 무관 진술",
    traps: ["mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제는 토스페이먼츠로 한다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "토스페이먼츠가 PG 직접 연동보다 출시가 빠르다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "팀 회의는 매주 월요일 오전에 한다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "supports",
        note: "출시 속도 우위가 토스 결정을 받친다 — 근거가 새로, 결정이 기존",
      },
    ],
    note: "s2는 토픽조차 안 겹치는 무관 진술 — 어떤 관계도 없음",
  },
  {
    id: "invented-supports-adjacency",
    description:
      "같은 글의 인접 진술들 — 본문이 인과를 안 이었는데 인접성만으로 관계를 지어내나",
    traps: ["invented-supports", "mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "대시보드 리디자인을 완료했다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "사용자 이탈률이 지난달보다 5% 늘었다",
      },
      {
        id: "s3",
        role: "new",
        type: "claim",
        confidence: "guess",
        content: "리디자인 후 첫 사용자 반응은 긍정적인 편이다",
      },
    ],
    golden: [],
    note: "셋 다 제품 현황으로 인접하지만 본문은 리디자인↔이탈↔반응 사이 인과를 잇지 않았다 — 인접성만으로 supports/conflicts를 내면 FP",
  },
  {
    id: "mixed-capstone",
    description:
      "현실형 묶음: 진짜 replaces+supports에 키워드 겹침 함정·무관 할 일을 섞음",
    traps: ["invented-supports", "mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제 연동은 토스로 한다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제는 포트원으로 가기로 했다, 토스는 접는다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "포트원으로 바꾸는 이유는 정산 리포트가 더 강해서다",
      },
      {
        id: "s3",
        role: "new",
        type: "todo",
        content: "포트원 연동 PoC를 다음 주까지 끝낸다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "정산 리포트는 회계팀이 매월 검토한다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "replaces",
        note: "'토스는 접는다'로 교대 명시 — e1을 갈아치움",
      },
      {
        from: "s2",
        to: "s1",
        type: "supports",
        note: "본문이 명시한 전환 근거(정산 리포트 우위)가 결정을 받친다",
      },
    ],
    note: "e2는 '정산 리포트' 키워드만 s2와 겹치는 무관 사실 — supports로 잇는 게 함정. s3은 무관 할 일",
  },
];

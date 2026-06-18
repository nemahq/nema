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
  | "mere-neighbor" // 뜻만 가까운 무관계 쌍에 관계를 다나
  | "near-duplicate"; // 거의 같은 두 진술을 충돌·대체로 오판하나 (NEM-162)

export interface RelationScenario {
  id: string;
  description: string;
  /** 이 시나리오가 시험하는 함정 — golden이 비거나 함정 진술을 품은 이유 */
  traps: RelationTrap[];
  statements: ScenarioStatement[];
  /** 이 진술들 사이 성립하는 관계의 전수 (없으면 빈 배열 = "엔진은 침묵해야") */
  golden: GoldenRelation[];
  /** 같음(중복) 골든 — 합쳐야 하는 쌍의 전수. 생략/빈 = 합칠 게 없음 (NEM-162) */
  expectedDuplicates?: Array<{ duplicate: string; of: string }>;
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
  {
    id: "caveat-not-conflict",
    description:
      "결정의 단점(둘 다 참)을 충돌로 과발화하나 — caveat ≠ contradiction (도그푸딩 핵심 실패 모드)",
    traps: ["false-conflict", "mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제 수단에 카카오페이를 추가하기로 했다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "카카오페이는 정산 수수료가 결제 수단 중 가장 높다",
      },
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제 수단은 카드와 계좌이체를 지원한다",
      },
    ],
    golden: [],
    note: "s2는 카카오페이 추가의 단점일 뿐 둘 다 동시에 참 — 충돌 아님(근거도 아님). e1은 '결제 수단' 토픽 형제, 추가가 기존 지원을 부정하지 않음 — 무관계. 무엇이든 내면 FP",
  },
  {
    id: "question-reentry-decided",
    description:
      "이미 결정된 주제에 질문이 재유입 — 질문은 주장을 안 하니 충돌 아님(기존 결정이 닫으면 resolves)",
    traps: ["false-conflict", "mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제는 토스로 한다",
      },
      {
        id: "s1",
        role: "new",
        type: "question",
        content: "결제 PG는 토스로 할지 포트원으로 할지 정해야 하나?",
      },
      {
        id: "s2",
        role: "new",
        type: "todo",
        content: "결제 환불 정책 문서를 작성한다",
      },
    ],
    golden: [
      {
        from: "e1",
        to: "s1",
        type: "resolves",
        note: "이미 내린 결정(토스)이 재유입된 PG 질문을 닫는다 — 답=결정, 대상=질문",
      },
    ],
    note: "s1은 질문 — 결정을 부정·경합하지 않으니 충돌로 뜨면 안 됨. s2는 '결제' 토픽 형제 할 일 — 무관계",
  },
  {
    id: "change-todo-not-conflict",
    description:
      "기존 결정을 바꾸려는 할 일을 충돌로 띄우나 — 할 일은 의도(미래)지 현재 주장이 아님 (측정 #2 발견)",
    traps: ["false-conflict", "mere-neighbor"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "파일 업로드 용량 제한은 10MB로 한다",
      },
      {
        id: "s1",
        role: "new",
        type: "todo",
        content: "업로드 용량 제한을 50MB로 올리는 작업을 한다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "업로드 진행률 표시를 추가했다",
      },
    ],
    golden: [],
    note: "s1은 '바꿀 계획'인 할 일 — 지금은 10MB 결정과 둘 다 참(아직 안 바꿈). 현재 충돌 아님(기껏해야 미래 replaces 씨앗). 충돌로 띄우면 FP. s2는 '업로드' 토픽 형제 — 무관계. 측정 #2 v1에서 모델이 8/8 충돌을 안 냄 — claim↔todo 양성 골든이 과한 주장이라 음성 함정으로 보정",
  },
  {
    id: "conflicts-fact-clash-dogfood",
    description:
      "도그푸딩 충돌 미검출 재현: 같은 사실(시장에 강자가 있나)에 어긋난 두 주장을 conflicts로 잡나 — 부정어 없는 사실 모순",
    traps: ["false-conflict"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "guess",
        content: "1인가구 시장은 넓은데 아직 뚜렷한 강자가 보이지 않는다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "1인가구 쪽은 두잇이 이미 자금과 팀을 갖추고 선점해 있다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "그래서 1인가구 생활관리는 후보에서 접는다",
      },
    ],
    golden: [
      {
        from: "s1",
        to: "e1",
        type: "conflicts",
        note: "강자 없다(e1) vs 두잇이 선점(s1) — 같은 사실에 양립 불가, 교대 선언 없음. 부정어 없이도 모순",
      },
      {
        from: "s1",
        to: "s2",
        type: "supports",
        note: "'그래서'로 인과 명시 — 두잇 선점(s1)이 접는 결정(s2)을 받친다",
      },
    ],
    note: "핵심은 conflicts 재현(recall): 후보로 함께 주어지면 판정은 s1↔e1 충돌을 잡는다(미검출은 retrieval 단계 문제). s1→s2는 '그래서' 인과가 박힌 진짜 supports라 골든에 포함",
  },
  {
    id: "invented-supports-todo-unrelated-dogfood",
    description:
      "도그푸딩 supports 과잉 재현: 할 일을 supports의 to로 잇거나(to는 claim이어야), 토픽만 겹치는 무관 사실을 근거로 지어내나",
    traps: ["invented-supports", "mere-neighbor"],
    statements: [
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "N잡은 공백이 분명해 검증 난이도가 낮다",
      },
      {
        id: "e1",
        role: "existing",
        type: "todo",
        content: "N잡과 건강 중 무엇을 먼저 검증할지 정해야 한다",
      },
      {
        id: "s2",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "N잡은 정산 데이터를 매달 보내는 행동이 습관으로 자리잡는다",
      },
      {
        id: "e2",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "플랫폼마다 정산 주기와 세금 기준이 달라 수입 파악이 번거롭다",
      },
    ],
    golden: [],
    note: "s1→e1을 supports로 잇는 게 1순위 FP — e1은 todo라 supports의 to가 될 수 없다(닫으려면 resolves인데 s1은 답이 아님). s2→e2는 '정산' 토픽만 겹치는 무관 쌍(습관 vs 번거로움) — 근거 아님. 둘 다 침묵해야",
  },
  // --- near-duplicate 함정 (NEM-162) — 거의 같은 두 진술. 엔진엔 "같음" 관계가 없어
  // 이상은 침묵. 진짜 오답은 conflicts·replaces(둘 다 유효 주장 → '동시 참 불가'로
  // 충돌 오발, 또는 같은 방향 강화를 번복=replaces로 오판). 약한 supports는 무난. ---
  {
    id: "near-dup-reingest",
    description:
      "이미 넣은 결정을 거의 같은 말로 다시 넣음 — 합칠 동작이 없으니 침묵해야",
    traps: ["near-duplicate"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "결제 연동은 토스페이먼츠로 가기로 했다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "결제는 토스페이먼츠로 하기로 정했다",
      },
    ],
    golden: [],
    expectedDuplicates: [{ duplicate: "s1", of: "e1" }],
    note: "같은 결정의 재진술(표현만 다름) → 합쳐야(duplicate). conflicts로 잡으면 NEM-162 핵심 오판, replaces도 오답(번복·교대 없음). 관계가 아니라 중복으로 잡는 게 정답",
  },
  {
    id: "near-dup-harness-c3d1",
    description:
      "하니스 near-dup 함정(C3↔D1) — 같은 방향 강화(guess→certain), 번복 아님",
    traps: ["near-duplicate"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "guess",
        content: "남은 후보 중에서는 N잡 수익 관리가 가장 앞선다고 본다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "검증 대상을 N잡 수익 관리로 확정했다",
      },
    ],
    golden: [],
    expectedDuplicates: [],
    note: "확신만 오른 같은 입장(가장 앞선다 guess → 확정 certain)은 progression이라 합치면 안 됨 — 생각이 굳은 이력이 정보다. duplicate·conflicts·replaces 전부 오답(침묵해야). 과합치 함정 — duplicate FP를 잡는 자리",
  },
  {
    id: "near-dup-paraphrase",
    description: "같은 수치·사실을 표현만 바꿔 재진술 — 침묵해야",
    traps: ["near-duplicate"],
    statements: [
      {
        id: "e1",
        role: "existing",
        type: "claim",
        confidence: "certain",
        content: "가입 전환율이 12퍼센트 정도로 나온다",
      },
      {
        id: "s1",
        role: "new",
        type: "claim",
        confidence: "certain",
        content: "회원가입 전환율은 약 12퍼센트다",
      },
    ],
    golden: [],
    expectedDuplicates: [{ duplicate: "s1", of: "e1" }],
    note: "같은 사실의 표현 차이뿐 → 합쳐야(duplicate). 어긋나지도 갈음하지도 않으니 conflicts·replaces는 오답",
  },
];

// 진술 엔진(save-engine-v2) 평가용 씨앗 데이터
// 설계: docs/flows/save-engine-v2/eval-design.md
//
// 골든 진술은 고정 정답이 아니라 씨앗이다 — 절단 기준의 주인은 사람이므로,
// 경계가 애매한 항목은 needsHumanReview로 표시했고 사람 확정 전까지는 후보다.
// 골든이 보정되면 이 파일을 직접 고친다 (실데이터 보정 루프의 시작점).
//
// 주의: SEED_QUERIES의 expectedStatementIds는 골든 진술 id를 참조한다 —
// 골든 검토로 진술을 합치거나 빼면 그 id를 기대하는 질의도 함께 갱신할 것.

type StatementType = "claim" | "question" | "todo";
type StatementConfidence = "certain" | "guess";

/** 이 진술이 시험하는 절단·분류의 축 (실패의 축별 집계용) */
export type EvalAxis =
  | "compound-split" // 한 문장 속 여러 '왜'를 분리하나
  | "decision-reason-split" // 결정(무엇)과 근거(왜)를 분리하나
  | "merge-elaboration" // 한 '왜'의 부연 여러 문장을 하나로 합치나
  | "pronoun-resolution" // 대명사·생략을 해소해 단독으로 읽히게 하나
  | "confidence-mix" // 확정·추측이 섞인 글에서 guess를 가르나
  | "todo-boundary" // claim과 todo의 경계 ("~하기로 했다")
  | "question-label" // 질문·미결을 question으로 가르나
  | "numeric-fidelity" // 수치·고유명사를 다듬다 깨뜨리지 않나
  | "noise-drop" // '왜' 없는 텍스트(필러·감정)가 자연히 빠지나
  | "over-extraction-guard"; // 작은 입력을 부풀리지 않나

interface GoldenStatementBase {
  id: string;
  content: string;
  axes: EvalAxis[];
  /** 절단·라벨 경계가 애매해 사람 확정이 필요한 후보 */
  needsHumanReview: boolean;
  /** 무엇이 애매한가 (needsHumanReview일 때) */
  reviewNote?: string;
}

/** schema-design 4.2의 CHECK 제약(claim이면 확신도 필수, 그 외엔 금지)을 타입으로 강제 */
export type GoldenStatement =
  | (GoldenStatementBase & { type: "claim"; confidence: StatementConfidence })
  | (GoldenStatementBase & {
      type: Exclude<StatementType, "claim">;
      confidence?: never;
    });

export interface SeedDocument {
  id: string;
  description: string;
  /** 이 글이 겸하는 축 (글 단위 개요 — 채점은 진술 단위 axes로) */
  axes: EvalAxis[];
  input: string;
  goldenStatements: GoldenStatement[];
  note?: string;
}

// temporal은 의미검색 축이 아니다 — 시간은 날짜 산술이라 임베딩 소관이 아니므로
// 이 채점지에서 뺐다(temporal-query-design 8장 A). 시간 질의는 RELOCATED_TEMPORAL_QUERIES로
// 옮겨 구조화된 시간 경로의 시험으로 쓴다.
export type QueryFailureAxis =
  | "paraphrase" // 같은 단어를 안 쓰고 묻기 (09 완료 기준의 직접 검증)
  | "negation" // 부정 표현이 낀 질의
  | "proper-noun-variant" // 고유명사 표기 변형
  | "no-answer"; // 코퍼스에 정답이 없는 질의 (threshold 보정 재료)

export interface SeedQuery {
  id: string;
  query: string;
  /** 빈 배열 = 정답 없음 (no-answer 질의) */
  expectedStatementIds: string[];
  failureAxis: QueryFailureAxis;
  description?: string;
}

// ---------------------------------------------------------------------------
// 입력 글 + 골든 진술
// ---------------------------------------------------------------------------

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    id: "meeting-memo-1",
    description:
      "회의 직후 뭉친 메모. docs/product/04의 토스 예시 그대로 — 제품 문서가 이미 절단을 보증한 유일한 골든",
    axes: ["decision-reason-split", "confidence-mix", "noise-drop"],
    input:
      "오늘 김 대리랑 회의했는데, 결제 모듈을 PG사 직접 연동 대신 토스페이먼츠 쓰기로 했어. 김 대리는 출시가 급하다고 계속 그러고, 직접 연동은 한 달은 걸린다니까. 근데 수수료가 좀 걸리긴 해.",
    goldenStatements: [
      {
        id: "meeting-memo-1-s1",
        content: "결제 모듈은 토스페이먼츠로 연동하기로 했다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "meeting-memo-1-s2",
        content: "토스페이먼츠를 택한 이유는 출시 일정이 급해서다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "meeting-memo-1-s3",
        content: "PG사 직접 연동은 약 한 달이 걸린다",
        type: "claim",
        confidence: "certain",
        axes: [],
        needsHumanReview: false,
      },
      {
        id: "meeting-memo-1-s4",
        content: "김 대리는 빠른 출시를 원한다",
        type: "claim",
        confidence: "certain",
        axes: ["pronoun-resolution"],
        needsHumanReview: false,
      },
      {
        id: "meeting-memo-1-s5",
        content: "토스페이먼츠는 수수료가 부담된다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix"],
        needsHumanReview: false,
      },
    ],
  },
  {
    id: "transcript-1",
    description:
      "구어 전사 덩어리 (고객 인터뷰 보고). 필러 속에서 진술을 건지고 인물 지시를 해소하는지",
    axes: [
      "noise-drop",
      "pronoun-resolution",
      "merge-elaboration",
      "question-label",
    ],
    input:
      "그래서 어 이번에 고객 인터뷰를 세 건 했는데요 첫 번째 고객은 뭐 대체로 만족한다고 했어요 근데 검색이 좀 느리다는 피드백이 있었고 두 번째 고객은 아 이 분이 좀 재밌었는데 태그 기능을 자기가 원하는 대로 커스텀하고 싶다고 하더라고요 근데 그게 좀 우리 방향이랑은 다른 거잖아요 자동 태깅이 핵심인데 세 번째 고객은 전반적으로 좋은데 모바일에서 쓰고 싶다 이런 얘기를 했어요 그래서 정리하면 검색 속도 개선이랑 모바일 지원이 공통적인 요청이고 태그 커스텀은 우리 방향과 충돌해서 좀 더 고민해봐야 할 것 같아요",
    goldenStatements: [
      {
        id: "transcript-1-s1",
        content: "첫 번째 인터뷰 고객은 제품에 대체로 만족한다",
        type: "claim",
        confidence: "certain",
        axes: ["noise-drop", "pronoun-resolution"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s2",
        content: "첫 번째 인터뷰 고객은 검색이 느리다는 피드백을 줬다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s3",
        content:
          "두 번째 인터뷰 고객은 태그 기능을 원하는 대로 커스텀하고 싶어 한다",
        type: "claim",
        confidence: "certain",
        axes: ["pronoun-resolution", "noise-drop"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s4a",
        content: "태그 커스텀 요청은 우리 제품 방향과 다르다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split", "pronoun-resolution"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s4b",
        content: "우리 제품의 핵심은 자동 태깅이다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s5a",
        content: "세 번째 인터뷰 고객은 제품에 전반적으로 만족한다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split", "pronoun-resolution"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s5b",
        content: "세 번째 인터뷰 고객은 모바일에서 쓰고 싶어 한다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s6a",
        content: "검색 속도 개선은 고객들의 공통 요청이다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s6b",
        content: "모바일 지원은 고객들의 공통 요청이다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "transcript-1-s7",
        content: "태그 커스텀 요청을 수용할 것인가?",
        type: "question",
        axes: ["question-label"],
        needsHumanReview: false,
      },
    ],
  },
  {
    id: "weekly-1",
    description:
      "여러 주제가 섞인 팀 위클리 메모. 주제 경계에서 절단·일관성이 흔들리는지",
    axes: ["compound-split", "decision-reason-split", "todo-boundary"],
    input:
      "오늘 팀 위클리 했음. 프론트 쪽은 대시보드 리디자인 거의 끝났고 다음주 QA 들어감. 백엔드는 API 리팩토링 진행 중인데 예상보다 좀 늦어지고 있음. 원인은 레거시 코드 의존성이 복잡해서. 디자인팀은 모바일 앱 와이어프레임 1차 완료했고 피드백 반영 중. 아 그리고 채용 건은 백엔드 시니어 한 명 최종 면접까지 왔는데 다음주에 결과 나옴. 마지막으로 다음달 OKR 리뷰 일정 잡아야 함.",
    goldenStatements: [
      {
        id: "weekly-1-s1",
        content: "대시보드 리디자인이 거의 끝났다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s2",
        content: "대시보드 리디자인은 다음주 QA에 들어간다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s3",
        content: "백엔드 API 리팩토링이 예상보다 늦어지고 있다",
        type: "claim",
        confidence: "certain",
        axes: [],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s4",
        content:
          "API 리팩토링이 늦어지는 원인은 레거시 코드 의존성이 복잡해서다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s5a",
        content: "디자인팀은 모바일 앱 와이어프레임 1차를 완료했다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s5b",
        content: "디자인팀은 모바일 앱 와이어프레임 피드백을 반영 중이다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s6",
        content: "백엔드 시니어 채용 후보 한 명이 최종 면접까지 왔다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s7",
        content: "백엔드 시니어 채용 결과는 다음주에 나온다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "weekly-1-s8",
        content: "다음달 OKR 리뷰 일정을 잡아야 한다",
        type: "todo",
        axes: ["todo-boundary"],
        needsHumanReview: false,
      },
    ],
  },
  {
    id: "braindump-1",
    description:
      "할 일·미결 질문 위주의 머리비우기 메모. question·todo 분류와 확신도 혼재",
    axes: [
      "question-label",
      "todo-boundary",
      "confidence-mix",
      "numeric-fidelity",
    ],
    input:
      "출시 전에 정리할 것들. 랜딩 페이지 문구 최종본 금요일까지 마케팅에 넘겨야 함. 가격 정책은 아직도 결론이 안 났는데 월 9900원이 맞나? 경쟁사는 다 만원 밑이긴 한데 우리가 기능이 더 많아서 만원 넘겨도 될 것 같기도 하고. 온보딩 이메일 시퀀스는 내가 초안 쓰기로 했음. 아 그리고 베타 피드백 설문 마감이 수요일이라 목요일에 정리해서 공유하기. 근데 결제 실패율 모니터링은 누가 맡지?",
    goldenStatements: [
      {
        id: "braindump-1-s1",
        content: "랜딩 페이지 문구 최종본을 금요일까지 마케팅에 넘겨야 한다",
        type: "todo",
        axes: ["todo-boundary"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s2",
        content: "가격 정책은 아직 결론이 나지 않았다",
        type: "claim",
        confidence: "certain",
        axes: [],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s3",
        content: "월 9,900원이 적정 가격인가?",
        type: "question",
        axes: ["question-label", "numeric-fidelity"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s4",
        content: "경쟁사 가격은 모두 월 1만 원 미만이다",
        type: "claim",
        confidence: "certain",
        axes: ["numeric-fidelity"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s5a",
        content: "우리 제품은 경쟁사보다 기능이 더 많다",
        type: "claim",
        confidence: "certain",
        axes: ["decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s5b",
        content: "가격이 월 1만 원을 넘어도 될 것 같다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix", "decision-reason-split"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s6",
        content: "온보딩 이메일 시퀀스 초안은 내가 쓰기로 했다",
        type: "todo",
        axes: ["todo-boundary"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s7",
        content: "베타 피드백 설문은 수요일에 마감된다",
        type: "claim",
        confidence: "certain",
        axes: ["compound-split"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s8",
        content: "목요일에 베타 피드백 설문 결과를 정리해 공유한다",
        type: "todo",
        axes: ["compound-split", "todo-boundary"],
        needsHumanReview: false,
      },
      {
        id: "braindump-1-s9",
        content: "결제 실패율 모니터링은 누가 맡을 것인가?",
        type: "question",
        axes: ["question-label"],
        needsHumanReview: false,
      },
    ],
  },
  {
    id: "short-1",
    description:
      "짧은 단문 (독립 케이스). 하나를 여럿으로 부풀리지 않는지 — 입력이 작아야 성립",
    axes: ["over-extraction-guard"],
    input: "다음주 수요일까지 온보딩 문서 초안 완성하기로 함",
    goldenStatements: [
      {
        id: "short-1-s1",
        content: "다음주 수요일까지 온보딩 문서 초안을 완성하기로 했다",
        type: "todo",
        axes: ["over-extraction-guard", "todo-boundary"],
        needsHumanReview: false,
      },
    ],
    note: "기대 추출 수 = 정확히 1. 2개 이상이면 과잉 추출",
  },
  {
    id: "smalltalk-1",
    description:
      "잡담 위주 글 (독립 케이스). '왜'가 없는 텍스트는 추출되지 않는다(ingestion-design 노이즈 정의)의 검증",
    axes: ["noise-drop", "over-extraction-guard"],
    input:
      "오늘 사무실 이사 첫날. 새 의자 생각보다 편하다. 점심에 팀이랑 근처 국밥집 갔는데 다들 만족. 오후엔 정신없어서 뭘 했는지 모르겠네. 내일부터 다시 달려야지.",
    goldenStatements: [],
    note: "기대 추출 수 = 0. '새 의자 편하다' 같은 감상을 claim으로 받을지가 노이즈 경계의 실측 지점 — 골든 0개 자체가 사람 검토 대상",
  },
  {
    id: "weak-hedge-1",
    description:
      "도그푸딩 확신 차등 실패 재현: 약한 추측 표지('~해 보인다', '여지가 있다', '~고 본다')를 guess로 가르나 — 하니스에서 전부 certain으로 굳던 유형",
    axes: ["confidence-mix"],
    input:
      "후보를 보면, N잡은 매달 반복되는 일이라 습관이 붙기 쉬워 보인다. 건강 쪽은 웨어러블로 데이터가 자동으로 쌓이는 흐름이 있어 가능성이 있어 보인다. 예체능은 단독으로는 시장이 작지만 프리랜서나 1인가구로 넓혀갈 여지가 있다. 결론적으로 N잡이 가장 앞선다고 본다.",
    goldenStatements: [
      {
        id: "weak-hedge-1-s1",
        content: "N잡은 매달 반복되는 일이라 습관이 붙기 쉽다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix"],
        needsHumanReview: false,
      },
      {
        id: "weak-hedge-1-s2",
        content: "건강은 웨어러블로 데이터가 자동으로 쌓여 가능성이 있다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix"],
        needsHumanReview: false,
      },
      {
        id: "weak-hedge-1-s3",
        content: "예체능은 프리랜서나 1인가구로 넓혀갈 여지가 있다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix"],
        needsHumanReview: false,
      },
      {
        id: "weak-hedge-1-s4",
        content: "N잡이 가장 앞선 후보다",
        type: "claim",
        confidence: "guess",
        axes: ["confidence-mix"],
        needsHumanReview: false,
        reviewNote:
          "'가장 앞선다고 본다'는 단정형에 가깝지만 검증 전 판단이라 guess로 둔다 — 경계 사례",
      },
    ],
    note: "네 진술 모두 약한 추측 표지를 단 guess. 추출이 certain으로 굳히면 confidence 정확도가 떨어진다 — 하니스에서 본 실패의 격리 재현",
  },
];

// ---------------------------------------------------------------------------
// 검색 질의 (코퍼스 = 위 골든 진술 전체를 직접 임베딩 — eval-design 결정 #1)
// ---------------------------------------------------------------------------

export const SEED_QUERIES: SeedQuery[] = [
  {
    id: "q1",
    query: "결제 처리 어떤 업체로 정했었지?",
    expectedStatementIds: ["meeting-memo-1-s1"],
    failureAxis: "paraphrase",
    description: "'모듈'·'연동' 안 쓰고 묻기",
  },
  {
    id: "q2",
    query: "김 대리가 중요하게 생각하던 게 뭐였지?",
    expectedStatementIds: ["meeting-memo-1-s4"],
    failureAxis: "paraphrase",
  },
  {
    id: "q3",
    query: "토스 쓰면 비용 쪽에 걸리는 거 없었나?",
    expectedStatementIds: ["meeting-memo-1-s5"],
    failureAxis: "paraphrase",
    description: "'수수료' 안 쓰고 묻기 + guess 진술이 검색에 닿는지",
  },
  {
    id: "q4",
    query: "직접 연동을 선택하지 않은 이유가 뭐지?",
    expectedStatementIds: ["meeting-memo-1-s2", "meeting-memo-1-s3"],
    failureAxis: "negation",
  },
  {
    id: "q5",
    query: "토스 페이먼트로 가기로 한 거 맞나?",
    expectedStatementIds: ["meeting-memo-1-s1"],
    failureAxis: "proper-noun-variant",
    description: "토스페이먼츠 → 토스 페이먼트 (띄어쓰기·표기 변형)",
  },
  {
    id: "q6",
    query: "김대리 의견이 어땠지?",
    expectedStatementIds: ["meeting-memo-1-s4"],
    failureAxis: "proper-noun-variant",
    description: "김 대리 → 김대리 (띄어쓰기 변형)",
  },
  {
    id: "q7",
    query: "고객들이 공통으로 바라는 개선점이 뭐였지?",
    expectedStatementIds: ["transcript-1-s6a", "transcript-1-s6b"],
    failureAxis: "paraphrase",
  },
  {
    id: "q8",
    query: "폰에서 쓰고 싶다는 의견이 있었나?",
    expectedStatementIds: ["transcript-1-s5b", "transcript-1-s6b"],
    failureAxis: "paraphrase",
    description: "모바일 → 폰",
  },
  {
    id: "q9",
    query: "커스텀 태그는 안 하기로 한 거야?",
    expectedStatementIds: ["transcript-1-s4a", "transcript-1-s7"],
    failureAxis: "negation",
    description:
      "코퍼스엔 '방향과 다르다'·'고민 필요'만 있음 — 부정 단정 질의가 닿는지",
  },
  {
    id: "q10",
    query: "백엔드 일정이 밀리는 이유가 뭐랬지?",
    expectedStatementIds: ["weekly-1-s3", "weekly-1-s4"],
    failureAxis: "paraphrase",
    description: "늦어지다 → 밀리다",
  },
  {
    id: "q11",
    query: "시니어 뽑는 건 어디까지 진행됐어?",
    expectedStatementIds: ["weekly-1-s6", "weekly-1-s7"],
    failureAxis: "paraphrase",
    description: "채용 → 뽑다",
  },
  {
    id: "q14",
    query: "구독료 얼마 받을지 정해졌나?",
    expectedStatementIds: [
      "braindump-1-s2",
      "braindump-1-s3",
      "braindump-1-s5b",
    ],
    failureAxis: "paraphrase",
    description: "가격 정책 → 구독료",
  },
  {
    id: "q15",
    query: "온보딩 관련해서 내가 맡은 게 뭐지?",
    expectedStatementIds: ["braindump-1-s6", "short-1-s1"],
    failureAxis: "paraphrase",
    description:
      "'온보딩'이 두 글에 등장(이메일 시퀀스 vs 문서 초안) — 둘 다 닿는지",
  },
  {
    id: "q16",
    query: "데이터베이스 백업 주기는 어떻게 하기로 했지?",
    expectedStatementIds: [],
    failureAxis: "no-answer",
    description:
      "코퍼스에 없는 주제 — top-1 점수가 threshold 보정의 반대쪽 재료",
  },
  {
    id: "q17",
    query: "사무실 이사 비용 정산은 누가 하기로 했지?",
    expectedStatementIds: [],
    failureAxis: "no-answer",
    description:
      "원문(smalltalk-1)엔 '사무실 이사'가 있지만 골든 진술은 0개 — 어휘만 겹치는 교란 케이스",
  },
];

// ---------------------------------------------------------------------------
// 시간 경로 질의 — 의미검색에서 떼어낸 시간 질의 (temporal-query-design 8장)
//
// 의미검색(SEED_QUERIES)이 아니라 구조화된 시간 경로가 답할 질의다. 여기 둔 채로
// 의미검색 채점에서 빠진다. 시간 경로 eval(설계 8장 B)이 골든 due_date 라벨을 붙여
// 이 쌍을 쓴다 — 그 러너는 질의→토큰 정확도를 채점하는 ④와 골든을 공유하므로 지금
// 짓지 않고, 질의·기대 진술 매핑만 보존한다.
// ---------------------------------------------------------------------------

export const RELOCATED_TEMPORAL_QUERIES = [
  {
    id: "q12",
    query: "다음주에 예정된 일이 뭐가 있지?",
    expectedStatementIds: ["weekly-1-s2", "weekly-1-s7", "short-1-s1"],
    note: "시간 표현으로 여러 글을 가로질러 묻기",
  },
  {
    id: "q13",
    query: "이번 주 안에 마감인 거 있나?",
    expectedStatementIds: ["braindump-1-s1", "braindump-1-s7", "braindump-1-s8"],
    note: "금요일·수요일·목요일 기한을 '이번 주'로 묻기 (다음주 수요일인 short-1-s1은 교란)",
  },
] as const;

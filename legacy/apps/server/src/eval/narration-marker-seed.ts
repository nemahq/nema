// 해설 마커 누락률 시드 — 답변가능한 진술 묶음만(근거 있음). 모양은 "마커 흘림 유발형"을
// 고른다: 진술이 많거나(태그할 문장이 많아 흘리기 쉽다), 관계 마커가 걸려 있거나(본문+참조를
// 둘 다 가리켜야 한다), 타입이 섞여(주장·질문) 산문이 길어지는 입력. 짧고 뻔한 묶음은
// 모델이 마커를 안 흘려 항상 0%로 나와 가짜 안심을 준다 — 조기경보가 작동하려면 압박을 준다.

type NarrationStatementType = "claim" | "question";

export interface NarrationFixtureStatement {
  id: string;
  content: string;
  type: NarrationStatementType;
  // 미지정이면 claim은 certain으로 정규화(제품 normalizeStatements 결).
  confidence?: "certain" | "guess" | null;
  // 관계 표식 — 가리키는 진술이 묶음 밖이면 related에 본문을 채운다(없으면 LLM이 id만 보고 지어냄).
  supersededBy?: string[];
  conflictsWith?: string[];
  resolvedBy?: string[];
}

export interface NarrationRelatedStatement {
  id: string;
  content: string;
  type: NarrationStatementType;
}

export interface NarrationFixture {
  name: string;
  query: string;
  statements: NarrationFixtureStatement[];
  related?: NarrationRelatedStatement[];
}

export const NARRATION_FIXTURES: NarrationFixture[] = [
  {
    // 진술 6개 단일 주제 — 태그할 문장이 많아 한둘 흘리기 쉬운 모양
    name: "channel-many-claims",
    query: "유튜브 채널 운영 어떻게 하기로 했더라?",
    statements: [
      {
        id: "ch1",
        content: "유튜브 채널은 주 2회 업로드로 운영한다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ch2",
        content: "영상 길이는 8분 안팎으로 맞춘다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ch3",
        content: "썸네일 제작은 외주를 준다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ch4",
        content: "초기 3개월은 광고비를 쓰지 않는다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ch5",
        content: "댓글 응대는 24시간 안에 하는 쪽으로 본다",
        type: "claim",
        confidence: "guess",
      },
      {
        id: "ch6",
        content: "협업 제안은 구독자 1만을 넘긴 뒤 받는다",
        type: "claim",
        confidence: "certain",
      },
    ],
  },
  {
    // 관계 체인 — 밀어냄(묶음 밖 related 가리킴) + 해소(질문→답). 본문·참조를 둘 다 태그해야 한다.
    name: "payment-relation-chain",
    query: "결제 PG는 결국 뭘로 정했고 정산은 어떻게 돼?",
    statements: [
      {
        id: "pg1",
        content: "결제는 토스페이먼츠로 한다",
        type: "claim",
        confidence: "certain",
        supersededBy: ["pgX"],
      },
      {
        id: "pg2",
        content: "정산 리포트 자동화가 필요하다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "pg3",
        content: "포트원이 정산 자동화를 지원하나?",
        type: "question",
        resolvedBy: ["pg4"],
      },
      {
        id: "pg4",
        content: "포트원은 정산 자동화를 지원한다",
        type: "claim",
        confidence: "certain",
      },
    ],
    related: [
      {
        id: "pgX",
        content: "결제를 포트원으로 전환한다",
        type: "claim",
      },
    ],
  },
  {
    // 타입 혼합 — 질문·주장이 섞여 산문이 종류마다 다른 문장을 만든다
    name: "sprint-mixed-types",
    query: "이번 스프린트 뭐 하기로 했지?",
    statements: [
      {
        id: "sp1",
        content: "로그인 버그를 이번 스프린트에 고친다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "sp2",
        content: "결제 모듈 리팩토링을 한다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "sp3",
        content: "디자인 시스템을 도입할까?",
        type: "question",
      },
      {
        id: "sp4",
        content: "온보딩 화면 개편은 다음 스프린트로 미룬다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "sp5",
        content: "QA는 외주로 돌리는 쪽으로 본다",
        type: "claim",
        confidence: "guess",
      },
    ],
  },
  {
    // 충돌 표식 + 진술 6개 — 충돌 상대를 가리키며 길어진 산문에서 흘림을 본다
    name: "onboarding-conflict-dense",
    query: "신규 입사자 온보딩 어떻게 잡았어?",
    statements: [
      {
        id: "ob1",
        content: "온보딩 첫 주는 셋업과 문서 읽기로 채운다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ob2",
        content: "둘째 주부터 실제 티켓을 배정한다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ob3",
        content: "멘토는 팀당 1명을 고정 배정한다",
        type: "claim",
        confidence: "certain",
        conflictsWith: ["ob4"],
      },
      {
        id: "ob4",
        content: "멘토 없이 팀 전체가 함께 돕는 방식을 쓴다",
        type: "claim",
        confidence: "certain",
        conflictsWith: ["ob3"],
      },
      {
        id: "ob5",
        content: "온보딩 회고는 첫 달 끝에 한 번 한다",
        type: "claim",
        confidence: "certain",
      },
      {
        id: "ob6",
        content: "장비 지급은 입사 전날까지 끝낸다",
        type: "claim",
        confidence: "certain",
      },
    ],
  },
];

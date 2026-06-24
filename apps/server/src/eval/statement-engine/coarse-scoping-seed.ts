// coarse scoping 시험지 (auto-scoping-design §6 A) — "질의 → 맞는 주제 고르기"를 잰다.
//
// 정답 주제(gold)는 tiro 실데이터 `curation.json`의 사람이 묶은 thread 18개에서 가져온다.
// 엔진 자동 태깅이 아니라 사람 분류라, coarse가 틀리면 라우터 탓임이 분명해진다(자기채점 회피).
// 질문은 난도 4단: 테마형(이름이 보임) / 묻힌 사실(이름엔 없는 디테일) / 인접 구분(붙은 주제 가르기)
// / 강등(못 좁혀 전역으로 빠져야 함, gold 비움).

export interface CoarseTopic {
  /** tiro thread id */
  id: string;
  /** 제품 주제처럼 짧은 라벨 (coarse가 이름만으로 고를 때 보는 것) */
  label: string;
  /** 한 줄 설명 ("여기 뭐가 들어오나") — 이름+설명 변형에서만 보여준다 */
  description: string;
}

export type CoarseBand = "thematic" | "buried" | "adjacent" | "degrade";

export interface CoarseQuery {
  id: string;
  text: string;
  band: CoarseBand;
  /** 정답 주제 id 집합. 빈 배열 = 못 좁혀 전역으로 가야 함(강등). */
  gold: string[];
}

export const COARSE_TOPICS: CoarseTopic[] = [
  {
    id: "ai_mkt_engine",
    label: "AI 마케팅 엔진",
    description:
      "AI 마케팅 툴의 PoC·평가방법론·CX 스코어·광고 피로도·SDK 연동·CEO 보고까지의 개발 줄기",
  },
  {
    id: "post_eval",
    label: "상담 후 평가",
    description:
      "알프 상담 종료 후 문제해결 여부 평가 — 4사분면 매트릭스·스코어·UI·베타·리더십 싱크",
  },
  {
    id: "ai_mkt_platform",
    label: "AI 마케팅 플랫폼",
    description:
      "AI 마케팅 플랫폼의 디자인·인바운드·세일즈 핸드오프·클라이언트 작업",
  },
  {
    id: "suggest",
    label: "Suggest 지식갭 제안",
    description:
      "알프 지식갭 아티클 제안 기능의 데이터 파이프라인·DB·UI·와이어프레임·지표·운영 비용",
  },
  {
    id: "alf",
    label: "ALF v2 A/B·아웃바운드",
    description: "ALF v2의 A/B 테스트와 아웃바운드, Suggest의 상위 우산",
  },
  {
    id: "core_mkt",
    label: "코어 마케팅 전략",
    description: "코어 마케팅의 전략 방향성",
  },
  {
    id: "connect",
    label: "커넥트 채널 간 상담 공유",
    description:
      "채널 간 채팅 연동 — 채팅을 채널에서 분리해 '챗 메타'로 보는 설계, POC 목표",
  },
  {
    id: "module_fed",
    label: "모듈 페더레이션 도입",
    description:
      "마이크로 프론트엔드 도입 — iframe 대신 Module Federation 채택, 호스트/레포 분리, 4월 23일 릴리즈",
  },
  {
    id: "cos_agent",
    label: "CoS 채널설정 에이전트",
    description:
      "AI 에이전트로 채널 설정(룰·지식·태스크) 수정 — Diff·컨펌 플로우·테스트 자동화",
  },
  {
    id: "phone_monitor",
    label: "전화 모니터링 리뉴얼",
    description:
      "전화 상담 모니터링 개편 — 고객 인터뷰, 지표 선택·대기시간 구간·대시보드 커스터마이징",
  },
  {
    id: "mkt_platform_ext",
    label: "마케팅 플랫폼 확장",
    description: "마케팅 플랫폼 확장 — 로그·UI·모노레포",
  },
  {
    id: "data_pipe",
    label: "데이터 연동·가이드",
    description:
      "데이터 수집 구조·API 연동·외부 연동(카페24·세그먼트)·내부 선적재 후 공개·배포 일정",
  },
  {
    id: "gemini",
    label: "Gemini 벤치마킹",
    description: "Gemini Enterprise 트렌드·경쟁사 벤치마킹",
  },
  {
    id: "homepage_demo",
    label: "홈페이지 AI 데모",
    description:
      "홈페이지 ALF 데모 — 브랜드/URL 검색·크롤링·DB 우선 폴백 구조·검색 속도·비용",
  },
  {
    id: "recommend_q",
    label: "추천질문 자동화",
    description: "AI가 생성한 추천 질문 자동 적용",
  },
  {
    id: "cos_commerce",
    label: "CoS 커머스 전략",
    description: "CoS 커머스 고객 전략",
  },
  {
    id: "channeltalk_mkt",
    label: "채널톡 마케팅 아키텍처",
    description: "채널톡 마케팅 아키텍처·고객 분석",
  },
  {
    id: "counsel_stats",
    label: "상담 통계 설계",
    description:
      "상담 처리시간 통계 — 전화 후처리 시간 데이터의 세 가지 합계·서비스 레벨 지표",
  },
];

export const COARSE_QUERIES: CoarseQuery[] = [
  // ── 테마형: 주제 이름이 질의에 그대로 드러난다 (기본기) ──
  {
    id: "t1",
    band: "thematic",
    gold: ["module_fed"],
    text: "모듈 페더레이션 도입 어떻게 하기로 했지?",
  },
  {
    id: "t2",
    band: "thematic",
    gold: ["phone_monitor"],
    text: "전화 모니터링 리뉴얼 인터뷰에서 뭐 나왔어?",
  },
  {
    id: "t3",
    band: "thematic",
    gold: ["connect"],
    text: "커넥트로 채널 간 상담 공유하는 설계 방향이 뭐였지?",
  },
  {
    id: "t4",
    band: "thematic",
    gold: ["post_eval"],
    text: "상담 후 평가 시스템 지표 어떻게 잡았어?",
  },
  {
    id: "t5",
    band: "thematic",
    gold: ["suggest"],
    text: "Suggest 지식갭 제안 파이프라인 설계 정리해줘",
  },
  {
    id: "t6",
    band: "thematic",
    gold: ["homepage_demo"],
    text: "홈페이지 AI 데모 만들 때 정한 거 뭐 있어?",
  },
  {
    id: "t7",
    band: "thematic",
    gold: ["counsel_stats"],
    text: "상담 통계 설계 회의 결론이 뭐였지?",
  },
  {
    id: "t8",
    band: "thematic",
    gold: ["cos_agent"],
    text: "CoS 에이전트로 채널 설정 수정하는 거 어떻게 설계했어?",
  },
  {
    id: "t9",
    band: "thematic",
    gold: ["gemini"],
    text: "Gemini 벤치마킹한 내용 정리해줘",
  },
  {
    id: "t10",
    band: "thematic",
    gold: ["ai_mkt_engine"],
    text: "AI 마케팅 엔진 PoC 계획 어떻게 짰지?",
  },
  {
    id: "t11",
    band: "thematic",
    gold: ["data_pipe"],
    text: "데이터 연동이랑 가이드 개선 논의한 거?",
  },
  {
    id: "t12",
    band: "thematic",
    gold: ["recommend_q"],
    text: "추천질문 자동 적용 어떻게 하기로 했어?",
  },

  // ── 묻힌 사실: 답은 그 주제 안 디테일인데, 주제 이름 단어를 안 쓴다 (§3.1 핵심 시험) ──
  {
    id: "b1",
    band: "buried",
    gold: ["post_eval"],
    text: "상담 잘 됐는지를 네 칸짜리 2차원 매트릭스로 나눠 봤던 거 어디였지?",
  },
  {
    id: "b2",
    band: "buried",
    gold: ["suggest"],
    text: "그 기능 월 운영비가 230만원쯤 든다고 했던 게 뭐였지?",
  },
  {
    id: "b3",
    band: "buried",
    gold: ["connect"],
    text: "채팅을 채널에서 떼어내서 따로 객체로 두고 본다던 설계?",
  },
  {
    id: "b4",
    band: "buried",
    gold: ["module_fed"],
    text: "iframe은 엣지케이스 많아서 안 쓰고 다른 걸로 정했잖아, 그 이유?",
  },
  {
    id: "b5",
    band: "buried",
    gold: ["cos_agent"],
    text: "앱 태스크 기능이 수천 채널 중 4개에만 깔려 있다던 얘기?",
  },
  {
    id: "b6",
    band: "buried",
    gold: ["phone_monitor"],
    text: "고객 대기시간을 5초·10초처럼 구간으로 끊어 본다던 거 어디?",
  },
  {
    id: "b7",
    band: "buried",
    gold: ["data_pipe"],
    text: "현재 구조 그대로 외부에 노출하지 말고 내부에 먼저 쌓자고 한 거?",
  },
  {
    id: "b8",
    band: "buried",
    gold: ["homepage_demo"],
    text: "검색할 때 이미 모아둔 데서 먼저 찾고 없으면 URL 받는 폴백으로 가자던 거?",
  },
  {
    id: "b9",
    band: "buried",
    gold: ["counsel_stats"],
    text: "전화 후처리 시간 합계가 세 가지로 갈려서 헷갈린다던 거?",
  },
  {
    id: "b10",
    band: "buried",
    gold: ["ai_mkt_engine"],
    text: "그 툴이 프론트 알프 레포의 30~50% 규모쯤 될 거라던 게 뭐였지?",
  },

  // ── 인접 구분: 붙어 있는 형제 주제 중 맞는 쪽 (과포함은 무벌점, 맞는 걸 포함하나) ──
  {
    id: "a1",
    band: "adjacent",
    gold: ["ai_mkt_engine"],
    text: "AI 마케팅 쪽에서 CX 스코어랑 광고 피로도 측정하던 줄기?",
  },
  {
    id: "a2",
    band: "adjacent",
    gold: ["ai_mkt_platform"],
    text: "AI 마케팅에서 인바운드랑 세일즈 핸드오프 다루던 거?",
  },
  {
    id: "a3",
    band: "adjacent",
    gold: ["cos_commerce"],
    text: "CoS인데 커머스 고객 전략 쪽 얘기?",
  },
  {
    id: "a4",
    band: "adjacent",
    gold: ["alf"],
    text: "Suggest 위에 우산처럼 있다던 그 A/B·아웃바운드 줄기?",
  },

  // ── 강등: 못 좁혀 전역으로 가야 정상 (gold 비움 → 빈 선택이 정답) ──
  { id: "d1", band: "degrade", gold: [], text: "그때 그거 어떻게 됐더라?" },
  {
    id: "d2",
    band: "degrade",
    gold: [],
    text: "지난번에 정했던 거 다시 보여줘",
  },
];

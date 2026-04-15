import type { EntityType } from "@nema-io/shared";

interface EntitySeed {
  id: string;
  category: string;
  description: string;
  input: string;
  /** 반드시 추출되어야 하는 엔티티 */
  expected: { type: EntityType; name: string }[];
  /** 추출되면 안 되는 이름 (노이즈 검증) */
  forbidden: string[];
}

export const ENTITY_EXTRACTION_SEEDS: EntitySeed[] = [
  {
    id: "noise-common-nouns",
    category: "일반명사 노이즈",
    description: "음식/감정/음료가 걸러지고 기술 용어만 추출되는지",
    input:
      "오늘 점심에 파스타 먹고, 오후에 React Native 마이그레이션 회의했다. 배고팠는데 환타 마시니까 좀 나았음.",
    expected: [{ type: "Topic", name: "React Native" }],
    forbidden: ["파스타", "환타", "배고픔", "점심"],
  },
  {
    id: "no-synthesis",
    category: "합성 금지",
    description: "원문에 없는 표현을 합성하지 않는지",
    input:
      "Interviewed a senior frontend candidate. Technical skills were adequate. Communication was somewhat lacking. System design was slightly disappointing.",
    expected: [{ type: "Topic", name: "frontend" }],
    forbidden: ["frontend interview", "hiring", "interview"],
  },
  {
    id: "org-and-topic",
    category: "조직 + 도메인 용어",
    description: "고유명사(조직)와 도메인 용어가 정확히 추출되는지",
    input:
      "세쿼이아 캐피탈과 투자자 미팅을 했다. 반응은 비교적 긍정적이었으나 밸류에이션에 대해 다소 pushback을 받았다.",
    expected: [
      { type: "Organization", name: "세쿼이아 캐피탈" },
      { type: "Topic", name: "밸류에이션" },
    ],
    forbidden: ["투자자 미팅", "긍정적", "pushback"],
  },
  {
    id: "sentence-as-entity",
    category: "문장 엔티티화 방지",
    description: "문장이 통째로 엔티티가 되지 않는지",
    input: "오늘 쌀국수를 먹었다. 저녁에는 Figma로 와이어프레임 작업했다.",
    expected: [{ type: "Topic", name: "Figma" }],
    forbidden: ["오늘 쌀국수를 먹었다", "쌀국수", "와이어프레임 작업했다"],
  },
  {
    id: "multi-type",
    category: "복수 타입 정확도",
    description:
      "Person, Organization, Project, Location이 올바른 타입으로 추출되는지",
    input:
      "김민수가 San Francisco 출장 중 Stripe 팀과 Checkout Redesign 프로젝트에 대해 논의했다.",
    expected: [
      { type: "Person", name: "김민수" },
      { type: "Location", name: "San Francisco" },
      { type: "Organization", name: "Stripe 팀" },
      { type: "Project", name: "Checkout Redesign 프로젝트" },
    ],
    forbidden: [],
  },
  {
    id: "empty-extraction",
    category: "빈 배열 반환",
    description: "추출할 엔티티가 없을 때 빈 배열을 반환하는지",
    input: "오늘 좀 피곤했다. 별로 한 게 없는 하루.",
    expected: [],
    forbidden: ["피곤", "하루"],
  },
  {
    id: "english-proper-nouns",
    category: "영문 고유명사",
    description: "영문 입력에서 고유명사가 정확히 추출되는지",
    input:
      "Had a sync with the Google Cloud team about migrating our Kubernetes cluster. Jane suggested using Terraform for infra provisioning.",
    expected: [
      { type: "Organization", name: "Google Cloud team" },
      { type: "Person", name: "Jane" },
      { type: "Topic", name: "Kubernetes cluster" },
      { type: "Topic", name: "Terraform" },
    ],
    forbidden: ["sync", "migrating", "infra provisioning"],
  },
  {
    id: "named-event",
    category: "이름 있는 이벤트",
    description: "이름이 있는 행사/마일스톤은 Event로 추출되는지",
    input:
      "다음 주 Sprint Review에서 결제 모듈 데모를 보여주기로 했다. 시리즈 A 라운드도 곧 시작된다.",
    expected: [
      { type: "Event", name: "Sprint Review" },
      { type: "Event", name: "시리즈 A 라운드" },
    ],
    forbidden: ["데모", "결제 모듈 데모를 보여주기로 했다"],
  },
];

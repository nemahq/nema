import type { EntityType } from "@nema-io/shared";

interface EntityResolutionSeed {
  id: string;
  category: string;
  description: string;
  /** 새로 추출된 엔티티 */
  extracted: { name: string; type: EntityType };
  /** Stage 3 임베딩 검색으로 찾은 후보 (시뮬레이션) */
  candidates: { name: string; score: number }[];
  /** 기대 결과: 매칭되어야 하는 기존 엔티티 이름, 없으면 null */
  expectedMatch: string | null;
}

export const ENTITY_RESOLUTION_SEEDS: EntityResolutionSeed[] = [
  // --- 매칭되어야 하는 케이스 ---
  {
    id: "cross-lang-ko-en",
    category: "다국어 매칭",
    description: "한국어와 영어가 같은 개념을 가리키는 경우",
    extracted: { name: "세쿼이아 캐피탈", type: "Organization" },
    candidates: [{ name: "Sequoia Capital", score: 0.72 }],
    expectedMatch: "Sequoia Capital",
  },
  {
    id: "abbreviation",
    category: "약어 매칭",
    description: "약어와 전체 이름이 같은 개념인 경우",
    extracted: { name: "NYC", type: "Location" },
    candidates: [{ name: "New York City", score: 0.65 }],
    expectedMatch: "New York City",
  },
  {
    id: "specific-variant",
    category: "구체성 변형",
    description: "더 구체적인 이름이 같은 개념인 경우",
    extracted: { name: "React.js", type: "Topic" },
    candidates: [{ name: "React", score: 0.88 }],
    expectedMatch: "React",
  },
  {
    id: "cross-lang-food",
    category: "다국어 매칭",
    description: "한국어 음식명과 영어 음식명",
    extracted: { name: "쌀국수", type: "Topic" },
    candidates: [{ name: "Pho", score: 0.62 }],
    expectedMatch: "Pho",
  },
  {
    id: "honorific-variation",
    category: "존칭 변형",
    description: "존칭 유무로 달라지는 동일 인물",
    extracted: { name: "Dr. Lee", type: "Person" },
    candidates: [{ name: "이박사", score: 0.68 }],
    expectedMatch: "이박사",
  },

  // --- 매칭하면 안 되는 케이스 ---
  {
    id: "similar-but-different",
    category: "유사하지만 다른 개념",
    description: "React와 React Native는 다른 기술",
    extracted: { name: "React Native", type: "Topic" },
    candidates: [{ name: "React", score: 0.85 }],
    expectedMatch: null,
  },
  {
    id: "same-name-different-concept",
    category: "동명이인/동명이의",
    description: "Apple(회사)과 Apple(과일)은 다른 개념 — type이 같아도 문맥상 다름",
    extracted: { name: "Apple Vision Pro", type: "Topic" },
    candidates: [{ name: "Apple", score: 0.78 }],
    expectedMatch: null,
  },
  {
    id: "substring-same",
    category: "부분 문자열 = 동일",
    description: "약간 구체적인 표현이지만 같은 개념을 가리키는 경우",
    extracted: { name: "밸류에이션", type: "Topic" },
    candidates: [{ name: "valuation", score: 0.75 }],
    expectedMatch: "valuation",
  },
  {
    id: "related-but-distinct",
    category: "관련 있지만 별개",
    description: "AI와 머신러닝은 관련 있지만 별개 개념",
    extracted: { name: "AI", type: "Topic" },
    candidates: [{ name: "머신러닝", score: 0.7 }],
    expectedMatch: null,
  },
  {
    id: "org-vs-product",
    category: "조직 vs 제품",
    description: "같은 이름이지만 조직과 제품은 다른 엔티티",
    extracted: { name: "Stripe", type: "Organization" },
    candidates: [{ name: "Stripe Checkout", score: 0.75 }],
    expectedMatch: null,
  },
];

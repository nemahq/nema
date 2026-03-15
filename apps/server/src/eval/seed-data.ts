// Phase 1 (Drafting) 평가용 시드 데이터
// 카테고리별 입력 + 평가 시 주의점 정의

interface SeedInput {
  id: string;
  category: string;
  description: string;
  input: string;
  /** pass/fail 판단 시 특히 확인할 포인트 */
  checkpoints: string[];
}

interface EditCycleSeedInput {
  id: string;
  category: string;
  description: string;
  previousBody: string;
  editRequest: string;
  checkpoints: string[];
}

export const PHASE1_SEEDS: SeedInput[] = [
  {
    id: "short-memo-1",
    category: "짧은 메모",
    description: "한국어 단문 메모. 정보 손실 없이 정제되는지",
    input: "다음주 수요일까지 온보딩 문서 초안 완성하기로 함",
    checkpoints: [
      "마감 시점(다음주 수요일)이 보존되는가",
      "과도하게 부풀리지 않는가 (1-2문장이면 충분)",
    ],
  },
  {
    id: "long-multi-1",
    category: "긴 다항목 텍스트",
    description: "여러 주제가 섞인 팀 위클리 내용. 소제목으로 구조화되는지",
    input:
      "오늘 팀 위클리 했음. 프론트 쪽은 대시보드 리디자인 거의 끝났고 다음주 QA 들어감. 백엔드는 API 리팩토링 진행 중인데 예상보다 좀 늦어지고 있음. 원인은 레거시 코드 의존성이 복잡해서. 디자인팀은 모바일 앱 와이어프레임 1차 완료했고 피드백 반영 중. 아 그리고 채용 건은 백엔드 시니어 한 명 최종 면접까지 왔는데 다음주에 결과 나옴. 마지막으로 다음달 OKR 리뷰 일정 잡아야 함.",
    checkpoints: [
      "5개 항목(프론트/백엔드/디자인/채용/OKR)이 모두 보존되는가",
      "소제목(##)으로 구조화되는가",
      "'좀 늦어지고 있음' — 정도 표현이 유지되는가",
      "'아 그리고' 같은 필러가 제거되는가",
    ],
  },
  {
    id: "english-1",
    category: "영어 입력",
    description: "영어 비즈니스 미팅 메모. 정보 보존 + 구조화",
    input:
      "Had a sync with the marketing team about Q2 launch plan. They want to push the launch date by two weeks because the landing page copy isn't ready. I pushed back a bit — we can't keep delaying. Compromise: launch with a simplified landing page first, full version follows one week later.",
    checkpoints: [
      "타협안(simplified landing page → full version 1주 후)이 정확히 보존되는가",
      "'pushed back a bit' — 정도 표현이 유지되는가",
      "영어 입력이 영어로 출력되는가",
    ],
  },
  {
    id: "ambiguous-1",
    category: "모호한/불완전한 입력",
    description: "'그 건'이 무엇인지 불명확. 억지로 구체화하지 않는지",
    input: "그 건은 일단 보류하기로 했음",
    checkpoints: [
      "'그 건'을 임의로 특정하지 않는가",
      "모호함이 그대로 유지되는가",
      "없는 맥락을 추가하지 않는가",
    ],
  },
  {
    id: "structured-1",
    category: "이미 잘 정리된 입력",
    description: "이미 구조화된 텍스트. 과도하게 변형하지 않는지",
    input: `프로젝트 X 일정 변경 사항:
- 기존 마감: 3월 15일
- 변경된 마감: 3월 29일
- 사유: 외부 API 연동 지연
- 영향 범위: 결제 모듈, 알림 시스템
- 대응: 결제 모듈 우선 개발, 알림은 다음 스프린트로 이동`,
    checkpoints: [
      "날짜/사유/범위/대응이 모두 정확히 보존되는가",
      "이미 깔끔한 구조를 불필요하게 재구성하지 않는가",
      "정보가 추가되거나 빠지지 않는가",
    ],
  },
  {
    id: "emotional-1",
    category: "감정적/구어체 입력",
    description: "감정 표현 제거 + 비즈니스 사실 보존",
    input:
      "아 진짜 오늘 클라이언트 미팅 너무 빡셌다 ㅋㅋ 갑자기 스펙 바꿔달라고 하는데 이미 개발 80%나 된 기능이거든?? 근데 대표가 그냥 해주자고 해서 일단 수용함. 추가 일정은 2주 더 받기로 했고 추가 비용은 별도 청구하기로 함. 진짜 힘들다",
    checkpoints: [
      "'ㅋㅋ', '빡셌다', '진짜 힘들다' 등 감정 표현이 제거되는가",
      "스펙 변경 수용, 2주 추가, 별도 청구 — 사실이 모두 보존되는가",
      "개발 80% 진행이라는 맥락이 보존되는가",
    ],
  },
  {
    id: "technical-1",
    category: "기술적 내용",
    description: "기술 용어와 수치가 정확히 보존되는지",
    input:
      "Qdrant에서 HNSW 인덱스 파라미터 테스트함. m=16, ef_construction=128이 기본값인데 m=32로 올리니까 recall이 0.95에서 0.98로 올라감. 대신 인덱싱 시간 40% 증가. 우리 데이터 규모(10만 벡터 이하)에서는 m=32가 적절하다고 판단. ef도 256으로 올릴지는 데이터 더 쌓인 후 결정.",
    checkpoints: [
      "파라미터명(m, ef_construction)과 수치가 정확한가",
      "recall 변화(0.95→0.98)가 보존되는가",
      "'적절하다고 판단' — 판단의 주관성이 유지되는가",
      "미결정 사항(ef 256)이 미결정으로 남아있는가",
    ],
  },
  {
    id: "transcript-1",
    category: "구어체 전사 텍스트",
    description: "녹음 전사체. 필러 제거 + 핵심 구조화",
    input:
      "그래서 어 이번에 고객 인터뷰를 세 건 했는데요 첫 번째 고객은 뭐 대체로 만족한다고 했어요 근데 검색이 좀 느리다는 피드백이 있었고 두 번째 고객은 아 이 분이 좀 재밌었는데 태그 기능을 자기가 원하는 대로 커스텀하고 싶다고 하더라고요 근데 그게 좀 우리 방향이랑은 다른 거잖아요 자동 태깅이 핵심인데 세 번째 고객은 전반적으로 좋은데 모바일에서 쓰고 싶다 이런 얘기를 했어요 그래서 정리하면 검색 속도 개선이랑 모바일 지원이 공통적인 요청이고 태그 커스텀은 우리 방향과 충돌해서 좀 더 고민해봐야 할 것 같아요",
    checkpoints: [
      "3건의 인터뷰 내용이 각각 구분되어 보존되는가",
      "'어', '뭐', '아', '근데' 등 필러가 제거되는가",
      "결론(검색 속도 + 모바일 = 공통, 태그 커스텀 = 방향 충돌)이 보존되는가",
      "'좀 느리다', '좀 더 고민' — 정도 표현이 유지되는가",
      "소제목으로 구조화되는가 (인터뷰 3건 + 정리)",
    ],
  },
];

export const PHASE1_EDIT_SEEDS: EditCycleSeedInput[] = [
  {
    id: "edit-cycle-1",
    category: "수정 사이클",
    description: "기존 body에 정보 추가 + 일부 수정 요청",
    previousBody:
      "Had an investor meeting. Reception was fairly positive, but got pushed back somewhat on valuation. Follow-up meeting was scheduled.",
    editRequest:
      "팔로업 미팅 날짜가 3월 20일로 잡혔다는 거 추가해줘. 그리고 투자자 이름은 빼고 펀드명이 알파벤처스라는 것만 넣어줘.",
    checkpoints: [
      "팔로업 미팅 날짜(3월 20일)가 추가되는가",
      "펀드명(알파벤처스)이 포함되는가",
      "기존 내용(fairly positive, pushed back somewhat)이 보존되는가",
      "전체 body가 반환되는가 (변경 부분만이 아니라)",
    ],
  },
];

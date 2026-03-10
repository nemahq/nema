import type { SessionSummary } from "@nema-io/shared";

const TITLES = [
  "프로젝트 구조 설계",
  "API 엔드포인트 정리",
  "디자인 시스템 토큰 논의",
  "온보딩 플로우 기획",
  "성능 최적화 방안",
  "에러 핸들링 전략",
  "배포 파이프라인 설정",
  "접근성 검토",
  "모바일 반응형 대응",
  "검색 기능 스펙",
  "알림 시스템 설계",
  "사용자 피드백 분석",
  "데이터 모델링",
  "캐싱 전략 논의",
  "테스트 커버리지 개선",
  "인증 플로우 개선",
  "로깅 체계 정비",
  "모니터링 대시보드",
  "i18n 키 관리",
  "컴포넌트 라이브러리 정리",
  "마이그레이션 계획",
  "코드 리뷰 가이드",
  "CI 파이프라인 최적화",
  "보안 점검 항목",
  "릴리즈 체크리스트",
  null,
  "상태 관리 패턴",
  null,
  "라우팅 구조 재설계",
  "타입 시스템 강화",
];

const PAGE_SIZE = 20;
const TOTAL = 80;

function createMockSession(index: number): SessionSummary {
  const date = new Date();
  date.setHours(date.getHours() - index * 3);

  return {
    id: crypto.randomUUID(),
    title: TITLES[index % TITLES.length],
    createdAt: date.toISOString(),
    updatedAt: date.toISOString(),
  };
}

const ALL_SESSIONS = Array.from({ length: TOTAL }, (_, i) =>
  createMockSession(i),
);

export function fetchMockSessions(cursor?: string): {
  items: SessionSummary[];
  nextCursor: string | null;
} {
  const startIndex = cursor ? Number(cursor) : 0;
  const items = ALL_SESSIONS.slice(startIndex, startIndex + PAGE_SIZE);
  const nextIndex = startIndex + PAGE_SIZE;

  return {
    items,
    nextCursor: nextIndex < TOTAL ? String(nextIndex) : null,
  };
}

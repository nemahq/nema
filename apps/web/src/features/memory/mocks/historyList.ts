// 히스토리 리스트 UI 검증용 mock 데이터.
// 시간 그룹 (오늘 / 어제 / 이번 달 / 올해 / 연도) + 상태 (completed / processing / failed)
// + sessionId null + 긴 제목 truncate 등 다양한 케이스를 한 번에 확인할 수 있게 구성.

function relativeDate(dayOffset: number, hours: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

export const MOCK_HISTORY_ITEMS = [
  // 오늘
  {
    id: "t1",
    createdAt: relativeDate(0, 9, 15),
    primaryMemory: { id: "m1", name: "팀 미팅 논의사항" },
    memoryCount: 5,
    sessionId: "session-1",
    status: "completed" as const,
  },
  {
    id: "t2",
    createdAt: relativeDate(0, 11, 30),
    primaryMemory: { id: "m2", name: "이메일 정리 메모" },
    memoryCount: 1,
    sessionId: "session-2",
    status: "completed" as const,
  },
  {
    id: "t3",
    createdAt: relativeDate(0, 14, 20),
    primaryMemory: { id: "m3", name: "독서 노트: 디자인 시스템 사고" },
    memoryCount: 3,
    sessionId: "session-3",
    status: "completed" as const,
  },
  {
    id: "t4",
    createdAt: relativeDate(0, 16, 45),
    primaryMemory: { id: "m4", name: "오전 스탠드업 노트" },
    memoryCount: 1,
    sessionId: "session-4",
    status: "processing" as const,
  },
  {
    id: "t5",
    createdAt: relativeDate(0, 19, 10),
    primaryMemory: {
      id: "m5",
      name: "긴 제목으로 row 안에서 제목이 어떻게 truncate 되는지 확인하는 케이스",
    },
    memoryCount: 9,
    sessionId: "session-5",
    status: "completed" as const,
  },
  // 어제
  {
    id: "y1",
    createdAt: relativeDate(-1, 8, 30),
    primaryMemory: { id: "m6", name: "운동 기록" },
    memoryCount: 1,
    sessionId: "session-6",
    status: "completed" as const,
  },
  {
    id: "y2",
    createdAt: relativeDate(-1, 13, 15),
    primaryMemory: { id: "m7", name: "프로젝트 계획서 검토" },
    memoryCount: 2,
    sessionId: null,
    status: "failed" as const,
  },
  {
    id: "y3",
    createdAt: relativeDate(-1, 22, 30),
    primaryMemory: { id: "m8", name: "잠들기 전 회고" },
    memoryCount: 1,
    sessionId: "session-8",
    status: "completed" as const,
  },
  // 이번 달
  {
    id: "m1",
    createdAt: "2026-04-22T11:00:00.000Z",
    primaryMemory: { id: "m9", name: "친구와 점심 식사" },
    memoryCount: 1,
    sessionId: null,
    status: "completed" as const,
  },
  {
    id: "m2",
    createdAt: "2026-04-18T14:30:00.000Z",
    primaryMemory: { id: "m10", name: "분기 회고 미팅" },
    memoryCount: 6,
    sessionId: "session-10",
    status: "completed" as const,
  },
  {
    id: "m3",
    createdAt: "2026-04-12T10:00:00.000Z",
    primaryMemory: { id: "m11", name: "주말 계획" },
    memoryCount: 3,
    sessionId: "session-11",
    status: "completed" as const,
  },
  {
    id: "m4",
    createdAt: "2026-04-05T09:00:00.000Z",
    primaryMemory: { id: "m12", name: "독서 메모" },
    memoryCount: 1,
    sessionId: "session-12",
    status: "completed" as const,
  },
  // 올해
  {
    id: "y2026-1",
    createdAt: "2026-03-03T16:00:00.000Z",
    primaryMemory: { id: "m13", name: "디자인 시스템 도입 결정" },
    memoryCount: 7,
    sessionId: "session-13",
    status: "completed" as const,
  },
  {
    id: "y2026-2",
    createdAt: "2026-02-10T15:00:00.000Z",
    primaryMemory: { id: "m14", name: "분기 목표 설정" },
    memoryCount: 5,
    sessionId: "session-14",
    status: "completed" as const,
  },
  {
    id: "y2026-3",
    createdAt: "2026-01-20T13:00:00.000Z",
    primaryMemory: { id: "m15", name: "면접 준비 노트" },
    memoryCount: 4,
    sessionId: "session-15",
    status: "completed" as const,
  },
  {
    id: "y2026-4",
    createdAt: "2026-01-05T08:30:00.000Z",
    primaryMemory: { id: "m16", name: "신년 다짐" },
    memoryCount: 1,
    sessionId: "session-16",
    status: "completed" as const,
  },
  // 2025년
  {
    id: "y2025-1",
    createdAt: "2025-12-15T18:00:00.000Z",
    primaryMemory: { id: "m17", name: "연말 회고" },
    memoryCount: 3,
    sessionId: "session-17",
    status: "completed" as const,
  },
  {
    id: "y2025-2",
    createdAt: "2025-06-08T10:00:00.000Z",
    primaryMemory: { id: "m18", name: "중간 점검 회고" },
    memoryCount: 1,
    sessionId: "session-18",
    status: "completed" as const,
  },
  {
    id: "y2025-3",
    createdAt: "2025-03-14T11:00:00.000Z",
    primaryMemory: { id: "m19", name: "회사 합류 1주년" },
    memoryCount: 1,
    sessionId: null,
    status: "completed" as const,
  },
  // 2024년
  {
    id: "y2024-1",
    createdAt: "2024-11-02T09:00:00.000Z",
    primaryMemory: { id: "m20", name: "Nema 프로젝트 시작" },
    memoryCount: 2,
    sessionId: "session-20",
    status: "completed" as const,
  },
];

import type { Message, SessionSummary } from "@nema-io/shared";

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

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export const MOCK_MESSAGES: Message[] = [
  {
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content: "tRPC에서 스트리밍 응답을 처리하는 방법이 뭐야?",
    createdAt: minutesAgo(12),
  },
  {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: `tRPC에서 스트리밍을 구현하는 방법은 크게 두 가지입니다.

## 1. SSE (Server-Sent Events)

서버에서 클라이언트로 단방향 스트림을 보낼 때 적합합니다.

\`\`\`typescript
// 서버 라우터
export const chatRouter = router({
  stream: publicProcedure
    .input(z.object({ prompt: z.string() }))
    .subscription(async function* ({ input }) {
      const stream = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: input.prompt }],
        stream: true,
      });

      for await (const chunk of stream) {
        yield chunk.choices[0]?.delta?.content ?? "";
      }
    }),
});
\`\`\`

## 2. httpBatchStreamLink

tRPC v11에서 제공하는 내장 스트리밍 링크입니다.

\`\`\`typescript
// 클라이언트 설정
import { httpBatchStreamLink } from "@trpc/client";

const client = createTRPCClient({
  links: [
    httpBatchStreamLink({
      url: "/api/trpc",
    }),
  ],
});
\`\`\`

> **참고**: SSE 방식이 LLM 스트리밍에 더 적합합니다. \`httpBatchStreamLink\`는 일반 데이터 페칭 최적화에 좋습니다.

| 방식 | 용도 | 지원 버전 |
|------|------|-----------|
| SSE subscription | LLM 스트리밍, 실시간 업데이트 | tRPC v11+ |
| httpBatchStreamLink | 대용량 응답 최적화 | tRPC v11+ |
| WebSocket | 양방향 통신 | tRPC v10+ |`,
    createdAt: minutesAgo(11),
  },
  {
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content: "SSE 방식으로 프론트에서 받을 때는 어떻게 해?",
    createdAt: minutesAgo(8),
  },
  {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: `프론트엔드에서는 \`useSubscription\` 훅을 사용합니다.

\`\`\`tsx
function ChatStream({ prompt }: { prompt: string }) {
  const [tokens, setTokens] = useState<string[]>([]);

  trpc.chat.stream.useSubscription(
    { prompt },
    {
      onData(token) {
        setTokens((prev) => [...prev, token]);
      },
    },
  );

  return <p>{tokens.join("")}</p>;
}
\`\`\`

핵심 포인트:

- \`onData\` 콜백이 **토큰 단위**로 호출됩니다
- 상태 업데이트는 \`setState\` 함수형 업데이트로 처리해야 합니다
- 언마운트 시 자동으로 구독 해제됩니다`,
    createdAt: minutesAgo(7),
  },
  {
    id: crypto.randomUUID(),
    role: "user",
    type: "text",
    content:
      "고마워! 에러 핸들링은 어떻게 하면 좋을까? 네트워크 끊김 같은 케이스도 포함해서.",
    createdAt: minutesAgo(3),
  },
  {
    id: crypto.randomUUID(),
    role: "assistant",
    type: "text",
    content: `SSE 구독에서의 에러 핸들링은 \`onError\` 콜백으로 처리합니다.

\`\`\`typescript
trpc.chat.stream.useSubscription(
  { prompt },
  {
    onData(token) {
      setTokens((prev) => [...prev, token]);
    },
    onError(err) {
      if (err.data?.code === "TIMEOUT") {
        showToast("응답 시간이 초과되었습니다.");
      } else {
        showToast("연결이 끊어졌습니다. 다시 시도해주세요.");
      }
    },
  },
);
\`\`\`

네트워크 끊김 대응을 위해 **재연결 로직**도 추가하면 좋습니다:

\`\`\`python
# 참고: 서버 사이드 타임아웃 설정 (Python 예시)
STREAM_TIMEOUT = 30  # seconds
\`\`\`

실무에서 권장하는 패턴:

1. **지수 백오프 재시도** — 1초, 2초, 4초 간격으로 재연결
2. **하트비트 핑** — 30초마다 빈 이벤트를 보내서 연결 유지 확인
3. **클라이언트 타임아웃** — 응답 없이 60초 경과 시 사용자에게 알림`,
    createdAt: minutesAgo(2),
  },
];

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

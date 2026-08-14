// LLM 호출 자체는 짧게 끝난다(DEFAULT_TIMEOUT_MS, apps/server/src/infra/llm/
// openai-provider.ts — 30초). 그보다 넉넉히 여유를 둔 시간을 넘겨도 pending이면
// 지금 처리 중이 아니라 멈춘 것으로 본다. 이 시스템엔 "진짜로 지금 처리 중"이라는
// 서버 신호가 없어(digestion_status는 pending/completed 둘뿐) 이 기준은 어림값이다
// — 서버가 상태를 더 나누기 전까지 감수한다.
const LIKELY_PROCESSING_WINDOW_MS = 60_000;

type PendingSourceStatus = "processing" | "stalled";

export function classifyPendingSource(createdAt: string): PendingSourceStatus {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  return elapsedMs < LIKELY_PROCESSING_WINDOW_MS ? "processing" : "stalled";
}

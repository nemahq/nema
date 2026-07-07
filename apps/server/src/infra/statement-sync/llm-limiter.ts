import { createLimiter } from "@server/infra/llm/limiter";

// 동시 LLM 콜 상한은 이 한 군데서 관리한다 — source 병렬과 청크 병렬이 곱으로
// 불어나지 않게, 모든 스테이지(생성·추출·잇기)의 콜이 같은 제한기를 지난다.
// 동시 4 초과 시 제공자 타임아웃이 관찰된 전례(measurement-log #3)로 3.
const LLM_CALL_CONCURRENCY = 3;

export const limitLlmCall = createLimiter(LLM_CALL_CONCURRENCY);

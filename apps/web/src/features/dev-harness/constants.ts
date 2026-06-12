// 추출은 LLM 1콜(수 초) — 끝날 때까지만 짧게 폴링한다 (ingestion-design 2장)
export const SOURCE_POLL_INTERVAL_MS = 2_000;

-- 추출 lease를 LLM 타임아웃과 같은 근거로 묶는다.
--
-- 추출 호출의 상한이 60초(EXTRACTION_TIMEOUT_MS, SDK 자동 재시도 차단)인데
-- 기존 lease 기준 30초는 호출이 끝나기 전에 풀린다 — 워커 2인스턴스 이상에서
-- 같은 source의 중복 LLM 호출 + 늦게 끝난 쪽의 가짜 오류(pending 가드)로 이어진다.
-- 추출 lease 기준을 90초로 올려 (60초 호출 + DB 쓰기 여유) 한 시도를 온전히 덮는다.
-- 임베딩(fetch_pending_statements)은 LLM이 없어 30초 그대로 둔다.

CREATE OR REPLACE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  space_id   uuid,
  author_id  uuid,
  session_id uuid,
  body       text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_extraction_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    WHERE s2.extraction_status = 'pending'
      AND s2.extraction_retry_count < p_max_retries
      AND (s2.last_extraction_attempt IS NULL
           OR s2.last_extraction_attempt + (s2.extraction_retry_count + 1) * interval '90 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

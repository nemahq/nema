-- 추출 lease 90초 → 150초: 제공자 변동까지 한 시도를 덮는다.
--
-- 길이 곡선 재측정(measurement-log #5)에서 gpt-5의 정상 응답이 시간대에 따라
-- 같은 입력 기준 1.5~2.3배 출렁이는 게 관측됐다 — 1,278토큰 입력이 빠른 시간대
-- 33~38초, 느린 시간대 74~89초. 60초 타임아웃은 느린 시간대의 *정상* 호출을
-- 죽은 호출로 오판해 끊는다. 추출 타임아웃을 120초로 올리고(EXTRACTION_TIMEOUT_MS,
-- 워커), lease 기준도 같은 근거로 150초(120초 호출 + DB 쓰기 여유)로 올린다.
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
           OR s2.last_extraction_attempt + (s2.extraction_retry_count + 1) * interval '150 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

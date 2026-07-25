-- =============================================================
-- v1 표면 일괄 삭제 2/2: DB 스키마 정리 (chore/remove-unused-code)
--
-- 프론트엔드 v1 채팅 세션 코드(features/session 등) 제거에 맞춰 DB도 정리한다.
-- 프로덕션에 실데이터 없음 확인 후 진행 (Kyle, 2026-07-25).
--
-- 보존: sources/statements/spaces 등 v2 스키마 전체, update_updated_at()
-- =============================================================

-- ----- RPC 재정의: sources.session_id 제거에 맞춰 시그니처 축소 -----
-- create_source·fetch_pending_sources는 시그니처(인자/반환)가 바뀌어 DROP+CREATE.

DROP FUNCTION IF EXISTS create_source(uuid, text, uuid, text);

CREATE FUNCTION create_source(
  p_space_id        uuid,
  p_body            text,
  p_author_timezone text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_source_id uuid;
BEGIN
  IF NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', p_space_id;
  END IF;

  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'p_body must be a non-empty text';
  END IF;

  INSERT INTO sources (
    space_id, author_id, body, author_timezone, status,
    digestion_started_at
  )
  VALUES (
    p_space_id, auth.uid(), p_body, p_author_timezone, 'pending',
    now()
  )
  RETURNING id INTO v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;


DROP FUNCTION IF EXISTS fetch_pending_sources(int);

CREATE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  space_id        uuid,
  author_id       uuid,
  body            text,
  created_at      timestamptz,
  author_timezone text
) AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT s2.id
    FROM sources s2
    JOIN source_digestion_state sd ON sd.source_id = s2.id
    WHERE s2.extraction_status = 'pending'
      -- 리뷰 게이트: pending 원본은 Digest 확정 전 — 추출이 앞서가면 안 된다
      AND s2.status = 'active'
      AND sd.extraction_retry_count < p_max_retries
      -- lease 150초: 120초 LLM 타임아웃을 덮는다(extraction_lease_covers_slow_provider)
      AND (sd.last_extraction_attempt IS NULL
           OR sd.last_extraction_attempt + (sd.extraction_retry_count + 1) * interval '150 seconds' < now())
    LIMIT 10
    FOR UPDATE OF s2, sd SKIP LOCKED
  ),
  touched AS (
    UPDATE source_digestion_state sd
    SET last_extraction_attempt = now()
    WHERE sd.source_id IN (SELECT picked.id FROM picked)
      AND sd.extraction_retry_count < p_max_retries
      AND (sd.last_extraction_attempt IS NULL
           OR sd.last_extraction_attempt + (sd.extraction_retry_count + 1) * interval '150 seconds' < now())
    RETURNING sd.source_id
  )
  SELECT s.id, s.space_id, s.author_id, s.body, s.created_at, s.author_timezone
  FROM sources s
  JOIN touched t ON t.source_id = s.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ----- sources.session_id 컬럼 제거 -----
-- v1 채팅에서 소스를 만들 때만 채워지던 값. 지금 유일한 라이브 생성 경로
-- (SourceComposer → source.create)는 이 값을 보내지 않아 항상 NULL이었다.

ALTER TABLE sources DROP COLUMN IF EXISTS session_id;


-- ----- events 테이블 제거 -----
-- 서버 사이드 행동 이벤트 트래킹(event.track) — 리포 전체에서 호출부가 하나도 없다.
-- 지금 쓰는 건 별개의 클라이언트 PostHog 캡처(@web/lib/posthog/trackEvent)뿐이라
-- 이 테이블/RPC는 v1이라서가 아니라 이미 방치되어 죽은 경로였다.

DROP TABLE IF EXISTS events;


-- ----- append_message / update_message_payload RPC 제거 -----

DROP FUNCTION IF EXISTS append_message(uuid, jsonb);
DROP FUNCTION IF EXISTS update_message_payload(uuid, text, jsonb);


-- ----- session_retrievals → sessions 순으로 테이블 제거 (FK 의존 역순) -----

DROP TABLE IF EXISTS session_retrievals;
DROP TABLE IF EXISTS sessions;

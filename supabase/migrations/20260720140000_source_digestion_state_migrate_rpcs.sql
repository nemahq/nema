-- source_digestion_state_table.sql에서 만든 테이블을 실제로 쓰도록 RPC들을
-- 재작성한다. sources 쪽 옛 컬럼(extraction_retry_count, last_extraction_attempt,
-- digestion_retry_count, linking_retry_count, last_linking_attempt)은 이 마이그레이션
-- 이후로 아무도 안 쓰지만, 스테이징에서 충분히 검증하기 전까지는 남겨둔다 — 제거는
-- 별도 후속 마이그레이션에서.
--
-- 두 테이블에 걸친 쓰기는 순서를 지킨다: sources row를 먼저 잠그거나(FOR UPDATE)
-- sources를 먼저 UPDATE해서 그 row를 우선 잠근 다음에만 source_digestion_state를
-- 건드린다 — 그래야 두 테이블에 걸친 쓰기 사이에 다른 트랜잭션이 끼어들 수 없다.
-- (기존엔 한 테이블 안의 단일 UPDATE라 이 문제가 없었다.)

-- ── source_digestion_state에 짝 row를 함께 만든다 ──────────────────────────
CREATE OR REPLACE FUNCTION create_source(
  p_space_id        uuid,
  p_body            text,
  p_session_id      uuid DEFAULT NULL,
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

  INSERT INTO sources (space_id, author_id, session_id, body, author_timezone, status)
  VALUES (p_space_id, auth.uid(), p_session_id, p_body, p_author_timezone, 'pending')
  RETURNING id INTO v_source_id;

  INSERT INTO source_digestion_state (source_id) VALUES (v_source_id);

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ── 추출 단계: claim(집어감) ────────────────────────────────────────────────
-- extraction_retry_count·last_extraction_attempt가 새 테이블로 옮겨가 sources
-- UPDATE가 사라진다 — claim만으론 더 이상 sources realtime 이벤트가 안 나간다.
CREATE OR REPLACE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  space_id        uuid,
  author_id       uuid,
  session_id      uuid,
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
    FOR UPDATE OF s2 SKIP LOCKED
  ),
  touched AS (
    UPDATE source_digestion_state sd
    SET last_extraction_attempt = now()
    WHERE sd.source_id IN (SELECT picked.id FROM picked)
    RETURNING sd.source_id
  )
  SELECT s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at, s.author_timezone
  FROM sources s
  JOIN touched t ON t.source_id = s.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 추출 단계: 실패 시 재시도 카운트 증가 ───────────────────────────────────
-- sources row를 먼저 잠가(PERFORM ... FOR UPDATE) 상태 확인과 카운터 증가·상태
-- 전환 사이에 다른 트랜잭션이 끼어들지 못하게 한다.
CREATE OR REPLACE FUNCTION increment_source_extraction_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_new_count int;
BEGIN
  PERFORM 1 FROM sources
  WHERE id = p_source_id AND extraction_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending extraction', p_source_id;
  END IF;

  UPDATE source_digestion_state
  SET extraction_retry_count  = extraction_retry_count + 1,
      last_extraction_attempt = now()
  WHERE source_id = p_source_id
  RETURNING extraction_retry_count INTO v_new_count;

  UPDATE sources
  SET error_message = COALESCE(p_error_message, error_message),
      extraction_status = CASE
        WHEN v_new_count >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 추출 단계: 실패한 소스 수동 재시도 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION retry_source_extraction(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = p_source_id AND is_space_member(s.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access source %', p_source_id;
  END IF;

  UPDATE sources
  SET extraction_status = 'pending',
      error_message     = NULL
  WHERE id = p_source_id AND extraction_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not failed', p_source_id;
  END IF;

  -- last_extraction_attempt도 비워 lease 대기 없이 즉시 재인출되게 한다
  UPDATE source_digestion_state
  SET extraction_retry_count  = 0,
      last_extraction_attempt = NULL
  WHERE source_id = p_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ── digestion 단계: claim ────────────────────────────────────────────────
-- last_digestion_attempt는 listPendingSources가 화면에 노출하므로 sources에 남긴다
-- — UPDATE 대상은 그대로 sources, WHERE의 재시도 카운트 조건만 join으로 옮긴다.
CREATE OR REPLACE FUNCTION fetch_pending_digestion_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id           uuid,
  space_id     uuid,
  workspace_id uuid,
  author_id    uuid,
  body         text,
  created_at   timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_digestion_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    JOIN source_digestion_state sd ON sd.source_id = s2.id
    WHERE s2.digestion_status = 'pending'
      AND s2.status = 'pending'
      AND sd.digestion_retry_count < p_max_retries
      AND (s2.last_digestion_attempt IS NULL
           OR s2.last_digestion_attempt + (sd.digestion_retry_count + 1) * interval '150 seconds' < now())
    LIMIT 10
    FOR UPDATE OF s2 SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id,
    (SELECT sp.workspace_id FROM spaces sp WHERE sp.id = s.space_id),
    s.author_id, s.body, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── digestion 단계: 실패 시 재시도 카운트 증가 ──────────────────────────────
CREATE OR REPLACE FUNCTION increment_source_digestion_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_new_count int;
BEGIN
  PERFORM 1 FROM sources
  WHERE id = p_source_id AND digestion_status = 'pending'
  FOR UPDATE;

  -- 원본은 NOT FOUND에서 예외를 던지지 않고 조용히 반환한다 — 그대로 유지.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE source_digestion_state
  SET digestion_retry_count = digestion_retry_count + 1
  WHERE source_id = p_source_id
  RETURNING digestion_retry_count INTO v_new_count;

  UPDATE sources
  SET last_digestion_attempt = now(),
      error_message          = COALESCE(p_error_message, error_message),
      digestion_status = CASE
        WHEN v_new_count >= p_max_retries THEN 'failed'::digestion_status
        ELSE 'pending'::digestion_status
      END
  WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── digestion 단계: 시작/취소 — 카운터 리셋 ─────────────────────────────────
CREATE OR REPLACE FUNCTION start_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id AND c.type = 'ingestion' AND c.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE sources
  SET digestion_status       = 'pending',
      last_digestion_attempt = NULL,
      error_message          = NULL
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status IN ('completed', 'failed', 'cancelled')
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can digest', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE source_digestion_state
  SET digestion_retry_count = 0
  WHERE source_id = p_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION cancel_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET digestion_status       = 'cancelled',
      last_digestion_attempt = NULL,
      error_message          = NULL
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status = 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not being digested, or the caller cannot cancel it', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  UPDATE source_digestion_state
  SET digestion_retry_count = 0
  WHERE source_id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── linking 단계: claim ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fetch_pending_linking_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (id uuid, space_id uuid, created_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT s2.id
    FROM sources s2
    JOIN source_digestion_state sd ON sd.source_id = s2.id
    WHERE s2.linking_status = 'pending'
      AND s2.extraction_status = 'completed'
      AND sd.linking_retry_count < p_max_retries
      AND (sd.last_linking_attempt IS NULL
           OR sd.last_linking_attempt + (sd.linking_retry_count + 1) * interval '150 seconds' < now())
      AND NOT EXISTS (
        SELECT 1
        FROM statement_sources ss
        JOIN statements st ON st.id = ss.statement_id
        WHERE ss.source_id = s2.id AND st.ingestion_status = 'pending'
      )
    LIMIT 10
    FOR UPDATE OF s2 SKIP LOCKED
  ),
  touched AS (
    UPDATE source_digestion_state sd
    SET last_linking_attempt = now()
    WHERE sd.source_id IN (SELECT picked.id FROM picked)
    RETURNING sd.source_id
  )
  SELECT s.id, s.space_id, s.created_at
  FROM sources s
  JOIN touched t ON t.source_id = s.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── linking 단계: 실패 시 재시도 카운트 증가 ────────────────────────────────
CREATE OR REPLACE FUNCTION increment_source_linking_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
DECLARE
  v_new_count int;
BEGIN
  PERFORM 1 FROM sources
  WHERE id = p_source_id AND linking_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending linking', p_source_id;
  END IF;

  UPDATE source_digestion_state
  SET linking_retry_count  = linking_retry_count + 1,
      last_linking_attempt = now()
  WHERE source_id = p_source_id
  RETURNING linking_retry_count INTO v_new_count;

  UPDATE sources
  SET error_message = COALESCE(p_error_message, error_message),
      linking_status = CASE
        WHEN v_new_count >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── linking 단계: 실패한 소스 수동 재시도 ───────────────────────────────────
CREATE OR REPLACE FUNCTION retry_source_linking(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = p_source_id AND is_space_member(s.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access source %', p_source_id;
  END IF;

  UPDATE sources
  SET linking_status = 'pending',
      error_message  = NULL
  WHERE id = p_source_id AND linking_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not failed linking', p_source_id;
  END IF;

  UPDATE source_digestion_state
  SET linking_retry_count  = 0,
      last_linking_attempt = NULL
  WHERE source_id = p_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

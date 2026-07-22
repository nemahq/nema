-- =============================================================
-- 정리 중 표시의 경과 시간 기준을 별도 컬럼으로 분리
--
-- last_digestion_attempt는 워커가 큐에서 집어들 때·재시도할 때마다 now()로
-- 갱신된다(hasInputChangedSinceDigestion이 그 성질에 기댄다 — 정리가 다시
-- 시작된 뒤의 입력 변경만 잡아야 하므로). 그래서 이 값을 화면의 "정리중.."
-- 경과 시간에 쓰면 재시도마다 0초로 되돌아간다.
--
-- 사용자가 보고 싶은 건 "기억하기를 누른 뒤 얼마나 지났나"이지 내부 재시도
-- 횟수가 아니다 — start_source_digestion에서만 찍고 재시도·워커 클레임은
-- 절대 건드리지 않는 digestion_started_at을 따로 둔다.
-- =============================================================

ALTER TABLE sources ADD COLUMN digestion_started_at timestamptz;

-- 백필: 지금 처리 중인 원본은 기존 last_digestion_attempt(아직 안 붙잡혔으면
-- created_at)를 최선의 근사치로 채운다. 이후로는 create_source·start_source_digestion만
-- 이 값을 채운다.
UPDATE sources
SET digestion_started_at = COALESCE(last_digestion_attempt, created_at)
WHERE digestion_status = 'pending' AND status = 'pending';

-- create_source: 새 원본은 digestion_status 기본값('pending')을 그대로 받아
-- start_source_digestion을 거치지 않고 곧바로 정리 큐에 들어간다 — 여기서도
-- digestion_started_at을 찍어야 "정리 중이면 이 값이 항상 있다"는 성질이
-- 재시작 경로와 일치한다.
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

  INSERT INTO sources (
    space_id, author_id, session_id, body, author_timezone, status,
    digestion_started_at
  )
  VALUES (
    p_space_id, auth.uid(), p_session_id, p_body, p_author_timezone, 'pending',
    now()
  )
  RETURNING id INTO v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

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
      digestion_started_at   = now(),
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_digestion_state row missing for source %', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION cancel_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET digestion_status       = 'cancelled',
      last_digestion_attempt = NULL,
      digestion_started_at   = NULL,
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source_digestion_state row missing for source %', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 초안 관리 — Digest 생성(digestion) 취소 / 수동 실행 / 삭제 게이트
--
-- intake-flow "초안 관리" 4케이스(처리 중 취소, 초안에서 Source 삭제, 처리 중 액션 잠금,
-- 초안에서 Digest 추출 실행)를 받치는 상태 모델.
--
-- 문제: 지금까지 "처리 중"이라는 상태가 DB에 없었다. 워커는 digestion_status='pending'을
-- lease(150초)로 클레임할 뿐이라, 취소가 필드만 되돌리면 폴링 주기(2초) 안에 워커가
-- 그대로 재클레임한다. 취소는 인출 쿼리(fetch_pending_digestion_sources)의 WHERE에서
-- 빠지는 진짜 상태여야 한다.
--
-- 해법: sources.digestion_status를 공유 ingestion_status에서 떼어내 전용 enum으로 옮기고
-- 'cancelled'를 넣는다. 공유 enum에 값을 더하지 않는 이유 — ingestion_status는 워커 3상태
-- (pending/completed/failed)의 어휘이고 statements.ingestion_status·sources.extraction_status·
-- linking_status·digests.extraction_status가 함께 쓴다. 'cancelled'는 그 넷엔 도달할 수 없는
-- 값이라(사람이 멈출 수 있는 스테이지가 digestion 하나뿐 — 나머지는 리뷰 확정 뒤 자동으로
-- 흐른다) 공유 어휘에 끼우면 "이 컬럼이 취소될 수 있나?"를 타입이 더는 대답 못 한다.
-- digestion만 사람 개입 지점이라는 게 실제 모델 차이이므로 타입을 가른다.
--
-- 이로써 초안의 상태가 넷으로 갈린다:
--   pending   = 처리 중 (워커 대상 — 액션 잠금, 취소만 열림)
--   completed = 결과 없음 / 리뷰 열림 (changeset 유무로 갈림)
--   failed    = 실패
--   cancelled = 사람이 멈춤
-- 뒤 셋이 명세가 말하는 "평범한 대기 상태" — 추출 실행·삭제가 열린다.
-- =============================================================

-- =============================================================
-- 1) digestion_status enum 신설 + 컬럼 이관
--    partial index는 컬럼 타입에 걸려 있어 먼저 떨구고 뒤에 같은 모양으로 재생성한다.
-- =============================================================

CREATE TYPE digestion_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');

DROP INDEX idx_sources_digestion_pending;

ALTER TABLE sources ALTER COLUMN digestion_status DROP DEFAULT;
ALTER TABLE sources ALTER COLUMN digestion_status TYPE digestion_status
  USING digestion_status::text::digestion_status;
ALTER TABLE sources ALTER COLUMN digestion_status SET DEFAULT 'pending';

CREATE INDEX idx_sources_digestion_pending ON sources (id)
  WHERE digestion_status = 'pending';

-- =============================================================
-- 2) increment_source_digestion_retry — enum 캐스트만 새 타입으로
--    (다른 digestion RPC들은 문자열 리터럴 비교라 컬럼 타입 변경만으로 따라온다)
-- =============================================================

CREATE OR REPLACE FUNCTION increment_source_digestion_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- pending 가드: 늦게 도착한 재시도가 completed·cancelled 행을 되살리지 못하게.
  -- 취소가 in-flight 콜을 끊어 워커가 실패로 잡아도 이 가드가 되살아남을 막는다.
  UPDATE sources
  SET digestion_retry_count  = digestion_retry_count + 1,
      last_digestion_attempt = now(),
      error_message          = COALESCE(p_error_message, error_message),
      digestion_status = CASE
        WHEN digestion_retry_count + 1 >= p_max_retries THEN 'failed'::digestion_status
        ELSE 'pending'::digestion_status
      END
  WHERE id = p_source_id AND digestion_status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) cancel_source_digestion — 처리 중 취소 (케이스 "처리 중 취소")
--
--    digestion_status='pending'에서만. 'cancelled'로 옮기는 순간
--    fetch_pending_digestion_sources의 WHERE에서 빠져 워커가 재클레임하지 못한다.
--    retry_count·last_attempt·error_message를 함께 비워, 뒤이은 수동 실행이 lease를
--    기다리지 않고 깨끗한 첫 시도로 출발하게 한다.
--
--    이미 떠 있는 LLM 콜을 실제로 끊는 건 서버(인메모리 AbortController)의 몫이다 —
--    DB는 "다시 집지 마라"까지만 보증하고, 진행 중인 콜의 중단은 그 위 층에서 한다.
-- =============================================================

CREATE FUNCTION cancel_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET digestion_status       = 'cancelled',
      digestion_retry_count  = 0,
      last_digestion_attempt = NULL,
      error_message          = NULL
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status = 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not a source being digested that the caller can cancel', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 4) start_source_digestion — 수동 Digest 추출 실행 (케이스 "초안에서 Digest 추출 실행")
--
--    retry_source_digestion(digestion_status='failed'에서만, 호출자 없이 DB에만 있던 것)을
--    범용으로 넓혀 대체한다. 출발점은 "평범한 대기 상태"인 초안 셋 모두 —
--    cancelled(취소하고 다시), failed(실패 재시도), completed(결과 없어서 다시).
--    한 버튼이 셋을 다 받는다: 사용자에겐 전부 "이 글을 (다시) 처리해라" 하나이고,
--    출발 상태가 달라도 도착지는 같다(pending, 첫 시도).
--
--    리뷰가 이미 열린 원본은 막는다 — 같은 Source에 pending ingestion changeset이 둘
--    생기면 확정이 어느 쪽을 적용할지 갈린다(07-modeling "같은 Source에 리뷰가 동시에
--    여러 개 생기는 걸 방지"). completed 중 리뷰가 열린 것은 애초에 초안이 아니라
--    변경셋 대기라 이 버튼에 도달하지도 않지만, 서버가 스스로 막아야 계약이 닫힌다.
-- =============================================================

DROP FUNCTION retry_source_digestion(uuid);

CREATE FUNCTION start_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id
      AND c.type = 'ingestion'
      AND c.status = 'pending'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id;
  END IF;

  -- last_digestion_attempt도 비워 lease 대기 없이 즉시 재인출되게 한다
  UPDATE sources
  SET digestion_status       = 'pending',
      digestion_retry_count  = 0,
      last_digestion_attempt = NULL,
      error_message          = NULL
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status IN ('completed', 'failed', 'cancelled')
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can digest', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 5) trash_source — 처리 중 삭제 잠금 (케이스 "처리 중 상태에서 액션 잠금")
--
--    digestion_status='pending' 가드를 더한다. 삭제 자체는 처리 중이어도 안전하게
--    동작하지만(trashed가 되면 fetch의 status='pending' 게이트에서 빠지고
--    create_ingestion_review도 튕긴다), 명세가 "처리 중엔 삭제 비활성화 + 사유 표시"로
--    UI 계약을 못박았으므로 서버도 같은 계약을 강제한다 — 화면만 잠그고 API가 열려 있으면
--    계약이 화면 층에만 사는 셈이고, 처리 중 삭제를 허용하면 취소가 끊었을 LLM 콜을
--    끝까지 태우고 버리게 된다. 취소 → 삭제 2스텝이 의도된 경로다.
--    나머지 동작(pending에서만, 변경이력 없음)은 source_status_v2 그대로.
-- =============================================================

CREATE OR REPLACE FUNCTION trash_source(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- 삭제는 pending에서만 — active 원본은 되돌리기로 pending을 거쳐야 한다
  UPDATE sources
  SET status = 'trashed', trashed_at = now()
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle pending source the caller can trash', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(멤버십은 RPC 안에서 검증). 운영자(service_role)도 함께.
-- =============================================================

REVOKE ALL ON FUNCTION
  cancel_source_digestion(uuid),
  start_source_digestion(uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION
  cancel_source_digestion(uuid),
  start_source_digestion(uuid)
  TO authenticated, service_role;

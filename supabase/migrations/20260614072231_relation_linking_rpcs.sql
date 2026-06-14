-- =============================================================
-- 관계 엔진 3/3: 잇기 RPC — 추출 RPC 4종과 대칭
--
--   fetch_pending_linking_sources   — sources.linking_status 폴링 (인출=클레임)
--   apply_relation_changesets       — 적용(applied 관계 행 + 변경셋) + 제안(pending
--                                     변경셋) + 완료 표시를 한 트랜잭션 (relation-design §3·§6)
--   increment_source_linking_retry  — 실패 카운트·backoff (추출과 대칭)
--   retry_source_linking            — failed→pending 수동 재개 (추출과 대칭)
--
-- 전부 service_role 전용, retry만 사용자(멤버십 검증)도 허용.
-- =============================================================

-- =============================================================
-- 1) fetch_pending_linking_sources — 잇기 대상 원본 인출
--
--    방아쇠는 별도 이벤트가 아니라 인출 조건이다 (relation-design §3):
--    linking_status='pending' + 추출 완료 + 내 진술 중 임베딩 pending이 없음.
--    임베딩이 영영 실패(failed)한 진술은 배치를 막지 않는다 — "pending이 없다"가
--    조건이고 failed는 정착 상태로 친다(벡터가 없어 후보에서도 자연히 빠짐).
--
--    lease: (retry+1)×150초 — 잇기도 LLM 콜을 타므로 추출과 같은 상한을 덮는다.
-- =============================================================

CREATE OR REPLACE FUNCTION fetch_pending_linking_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id         uuid,
  space_id   uuid,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_linking_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    WHERE s2.linking_status = 'pending'
      AND s2.extraction_status = 'completed'
      AND s2.linking_retry_count < p_max_retries
      AND (s2.last_linking_attempt IS NULL
           OR s2.last_linking_attempt + (s2.linking_retry_count + 1) * interval '150 seconds' < now())
      AND NOT EXISTS (
        SELECT 1
        FROM statement_sources ss
        JOIN statements st ON st.id = ss.statement_id
        WHERE ss.source_id = s2.id AND st.ingestion_status = 'pending'
      )
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) apply_relation_changesets — 적용 + 제안 + 완료, 한 트랜잭션
--
--   p_applied: [{ "from_id", "to_id", "type" }]  확신·비충돌 — 조용히 그래프에.
--              관계 행(active) 생성 + applied 변경셋 1개(배치당 1개, 되돌리기 단위).
--   p_pending: [{ "from_id", "to_id", "type" }]  애매 또는 충돌 — 사람 대기.
--              관계 행은 만들지 않는다(pending 동안 행 없음) — pending 변경셋
--              건당 1개(사람의 결정 단위)에 제안만 담는다.
--
--   완료 표시(linking_status='completed')가 같은 트랜잭션이어야 하는 이유: 갈라지면
--   적용 성공 후 크래시 시 워커가 같은 배치를 재검사해 관계 제안이 중복된다(§3).
--   관계 0개(노이즈뿐·관계 없음)면 변경셋 없이 완료만 — 빈 변경셋을 남기지 않는다.
-- =============================================================

CREATE OR REPLACE FUNCTION apply_relation_changesets(
  p_source_id uuid,
  p_applied   jsonb DEFAULT '[]'::jsonb,
  p_pending   jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
  v_relation_id  uuid;
  v_item         jsonb;
  v_applied_any  boolean := false;
BEGIN
  IF jsonb_typeof(p_applied) != 'array' OR jsonb_typeof(p_pending) != 'array' THEN
    RAISE EXCEPTION 'p_applied and p_pending must be JSON arrays';
  END IF;

  -- 완료 표시 = pending 클레임. 이미 completed/failed면 멈춰 늦게 도착한 적용이
  -- 관계를 중복 생성하지 못하게 한다 (apply_ingestion_changeset과 같은 논리).
  UPDATE sources
  SET linking_status = 'completed',
      error_message  = NULL
  WHERE id = p_source_id AND linking_status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending linking', p_source_id;
  END IF;

  -- ----- applied: 관계 행 생성 후, 실제로 생긴 게 있을 때만 변경셋을 묶는다 -----
  -- 변경셋을 먼저 만들고 관계를 건다. 전부 중복(unique 충돌)이라 하나도 안 생기면
  -- 빈 변경셋이 남으므로, 그 경우 끝에서 지운다.
  INSERT INTO changesets (space_id, type, status, source_id)
  VALUES (v_space_id, 'relation', 'applied', p_source_id)
  RETURNING id INTO v_changeset_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_applied)
  LOOP
    -- 재시도가 같은 관계를 이중 적용하면 unique가 막는다 — 충돌 시 건너뛴다.
    INSERT INTO statement_relations (space_id, type, from_id, to_id)
    VALUES (
      v_space_id,
      (v_item->>'type')::relation_type,
      (v_item->>'from_id')::uuid,
      (v_item->>'to_id')::uuid
    )
    ON CONFLICT (from_id, to_id, type) DO NOTHING
    RETURNING id INTO v_relation_id;

    IF v_relation_id IS NOT NULL THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data)
      VALUES (
        v_changeset_id, 'create', 'relation', v_relation_id,
        jsonb_build_object(
          'type',    v_item->>'type',
          'from_id', v_item->>'from_id',
          'to_id',   v_item->>'to_id'
        )
      );
      v_applied_any := true;
    END IF;
  END LOOP;

  IF NOT v_applied_any THEN
    DELETE FROM changesets WHERE id = v_changeset_id;
  END IF;

  -- ----- pending: 건당 변경셋 1개. 관계 행은 안 만든다 -----
  -- target_id는 승인 시 생길 관계의 id를 미리 예약한다(changes.target_id NOT NULL).
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_pending)
  LOOP
    -- 재시도가 같은 쌍을 다시 제안하면 기존 pending 변경셋이 막는다 (§6 빌드 세부).
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM changesets c
      JOIN changes ch ON ch.changeset_id = c.id
      WHERE c.space_id = v_space_id
        AND c.type = 'relation' AND c.status = 'pending'
        AND ch.target_type = 'relation'
        AND ch.data->>'from_id' = v_item->>'from_id'
        AND ch.data->>'to_id'   = v_item->>'to_id'
        AND ch.data->>'type'    = v_item->>'type'
    );

    INSERT INTO changesets (space_id, type, status, source_id)
    VALUES (v_space_id, 'relation', 'pending', p_source_id)
    RETURNING id INTO v_changeset_id;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      v_changeset_id, 'create', 'relation', gen_random_uuid(),
      jsonb_build_object(
        'type',    v_item->>'type',
        'from_id', v_item->>'from_id',
        'to_id',   v_item->>'to_id'
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) increment_source_linking_retry — 실패 카운트·backoff (추출과 대칭)
-- =============================================================

CREATE OR REPLACE FUNCTION increment_source_linking_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- pending 가드: 늦게 도착한 재시도가 completed 행을 pending으로 되살리지 못하게
  UPDATE sources
  SET linking_retry_count  = linking_retry_count + 1,
      last_linking_attempt = now(),
      error_message        = COALESCE(p_error_message, error_message),
      linking_status = CASE
        WHEN linking_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_source_id AND linking_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending linking', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 4) retry_source_linking — failed→pending 수동 재개 (추출과 대칭)
--    첫 출시에선 운영자 도구. 사용자용 "다시 시도"도 같은 RPC.
-- =============================================================

CREATE OR REPLACE FUNCTION retry_source_linking(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- service_role은 auth.uid()가 NULL(운영자 경로), 사용자는 멤버십 검증
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = p_source_id AND is_space_member(s.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access source %', p_source_id;
  END IF;

  UPDATE sources
  SET linking_status       = 'pending',
      linking_retry_count  = 0,
      last_linking_attempt = NULL,
      error_message        = NULL
  WHERE id = p_source_id AND linking_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not failed linking', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION fetch_pending_linking_sources FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_linking_sources TO service_role;

REVOKE ALL ON FUNCTION apply_relation_changesets FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_relation_changesets TO service_role;

REVOKE ALL ON FUNCTION increment_source_linking_retry FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_source_linking_retry TO service_role;

-- 수동 재개: 운영자(service_role) + 사용자(멤버십 검증)
REVOKE ALL ON FUNCTION retry_source_linking FROM public, anon;
GRANT EXECUTE ON FUNCTION retry_source_linking TO authenticated, service_role;

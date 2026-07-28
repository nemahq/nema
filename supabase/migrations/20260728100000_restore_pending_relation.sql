-- =============================================================
-- restore_pending_relation — 버려진 relation changeset 되살리기 (in-place)
--
-- restore_ingestion_review(현행 정의 20260726075454:356, 최초 20260714130000:70)와
-- 같은 패턴: 새 changeset을 안 만들고 같은 행의 status만 closed→open으로
-- 되돌린다(07-modeling.md "버려짐을 되살릴 땐 in-place로 처리한다"). 이 RPC는
-- conflicts/duplicates/확신 관계 discarded 전부를
-- 대상으로 한다(type='relation'이면 하위 종류를 안 가림) — Changeset 상세 화면
-- (ChangesetRecordScreen)이 outcome='discarded'인 relation changeset을 보여줄 때
-- 트리거된다.
--
-- 재제안 가드: 같은 진술 쌍에 지금 open인 relation changeset이 있으면 거절한다
-- (되살리면 같은 쌍에 대한 판정 대기가 두 개가 되어 사람이 뭘 판정해야 하는지
-- 모호해진다). 방향 무관 비교가 필요한 이유·OR로 푸는 이유는 전부
-- apply_relation_changesets(20260727101911)의 재제안 가드 주석과 같다 — 그
-- 정의의 CONTINUE WHEN EXISTS 블록이 쓰는 것과 정확히 같은 OR 패턴을 재사용한다
-- (LEAST/GREATEST 아님 — 표현식 인덱스가 안 먹혀 폐기된 방식).
-- =============================================================

CREATE FUNCTION restore_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id          uuid;
  v_status             changeset_status;
  v_outcome            changeset_outcome;
  v_type               changeset_type;
  v_invalidated_by_id  uuid;
  v_relation_type      relation_type;
  v_from_id            uuid;
  v_to_id              uuid;
BEGIN
  SELECT c.space_id, c.status, c.outcome, c.type, c.invalidated_by_id
    INTO v_space_id, v_status, v_outcome, v_type, v_invalidated_by_id
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    -- ERRCODE 없이 두면 query_failed(500)로 떨어져, Space 멤버십을 잃었거나
    -- changeset이 사라진 정상적 거부가 스퓨리어스 500/Sentry로 샌다
    -- (20260727090000의 같은 RAISE에 붙은 선례와 같은 이유로 P0002를 쓴다).
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  -- invalidated_by_id가 있으면 사람이 거절한 게 아니라 다른 판정(중복 병합 등)이
  -- 이 제안의 끝점을 먼저 archive해 자동으로 닫힌 것이다(07-modeling.md "한 Digest가
  -- 여러 곳과 동시에 중복될 수 있다") — 되살릴 판단 자체가 사람 몫이 아니었으므로 막는다.
  IF v_type <> 'relation' OR v_status <> 'closed'
     OR v_outcome IS DISTINCT FROM 'discarded'
     OR v_invalidated_by_id IS NOT NULL THEN
    -- NM008(ingestion 리뷰 전용)이 아니라 NM011을 쓴다 — 이 가드는 특정 엔티티가
    -- 아니라 changeset 자체의 상태(open/closed·outcome)를 보는 것이라 revert_changeset과
    -- 같은 결(NM011 도입 주석 참고).
    RAISE EXCEPTION 'changeset % is not a discarded pending relation changeset the caller can restore', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  -- ->>'type'을 relation_type으로 캐스트해 enum 밖 값(데이터 손상)도 여기서
  -- 바로 걸러지게 한다(캐스트 실패 시 22P02로 던져지고 query_failed(500)로
  -- 떨어진다 — 정상 경로에선 안 생기는 진짜 장애라 그대로 둔다).
  SELECT (ch.data->>'type')::relation_type,
         (ch.data->>'from_id')::uuid,
         (ch.data->>'to_id')::uuid
    INTO v_relation_type, v_from_id, v_to_id
  FROM changes ch
  WHERE ch.changeset_id = p_changeset_id AND ch.target_type = 'relation'
  LIMIT 1;

  IF v_relation_type IS NULL OR v_from_id IS NULL OR v_to_id IS NULL THEN
    RAISE EXCEPTION 'changeset % has no parseable relation change row', p_changeset_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM changesets c
    JOIN changes ch ON ch.changeset_id = c.id
    WHERE c.space_id = v_space_id
      AND c.status = 'open'
      AND ch.target_type = 'relation'
      AND (ch.data->>'type')::relation_type = v_relation_type
      AND (
        (ch.data->>'from_id' = v_from_id::text AND ch.data->>'to_id' = v_to_id::text)
        OR (
          v_relation_type IN ('conflicts', 'duplicates')
          AND ch.data->>'from_id' = v_to_id::text
          AND ch.data->>'to_id'   = v_from_id::text
        )
      )
  ) THEN
    -- NM011이 아니라 NM013 — "changeset 상태가 바뀜"이 아니라 "같은 쌍에 이미
    -- open인 판정이 있다"는 다른 사실이라 새로고침으로는 안 풀린다(그 open
    -- changeset을 먼저 처리해야 함).
    RAISE EXCEPTION 'a relation changeset for the same statement pair is already open'
      USING ERRCODE = 'NM013';
  END IF;

  UPDATE changesets SET status = 'open', outcome = NULL WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION restore_pending_relation(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_pending_relation(uuid) TO authenticated, service_role;

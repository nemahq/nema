-- =============================================================
-- revert changeset 제목 — depth 기반으로 전환
--
-- 지금까지 revert_changeset(20260718090000_changeset_title.sql)이
-- `title || ' 되돌림'`을 SQL에서 직접 이어붙여 저장했다 — 원본 title이 영어
-- UI에서 채워진 경우에도 이 접미사는 항상 한국어라 언어가 섞인다(FE가 언어별로
-- 렌더링할 수 없는 고정 문자열이 저장돼버림).
--
-- title은 원본 그대로 물려주고(접미사 없음), 몇 단계나 되돌려졌는지는 별도
-- 정수 컬럼 revert_depth로 넘긴다 — 문구 조합(ICU 복수형 등 언어별 렌더링)은
-- FE가 title+revert_depth를 가지고 나중에 붙인다(이번 스코프 아님).
--
-- 체인 불변식: 한 origin 체인의 모든 revert changeset은 같은 title을 공유하고
-- (원본 title 그대로), revert_depth만 되돌리기/되살리기(redo) 한 번마다 1씩
-- 늘어난다(origin=0, 1차 revert=1, 그 redo=2, ...).
-- =============================================================

ALTER TABLE changesets ADD COLUMN revert_depth integer NOT NULL DEFAULT 0;

-- =============================================================
-- 1) revert_changeset — title은 원본 그대로, revert_depth만 누적
-- =============================================================

CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_source_id     uuid;
  v_orig_title    text;
  v_orig_depth    integer;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
BEGIN
  SELECT space_id, type, source_id, title, revert_depth
    INTO v_space_id, v_type, v_source_id, v_orig_title, v_orig_depth
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, reverts_id, author_id, title, revert_depth)
  VALUES (
    v_space_id, 'revert', 'applied', p_changeset_id, auth.uid(),
    v_orig_title, v_orig_depth + 1
  )
  RETURNING id INTO v_revert_id;

  -- ingestion 예외: changes 밖의 원문(source_id)도 pending으로 되돌린다
  -- ("글 통째로" — v2에선 archive가 아니라 pending 복귀, 07-modeling.md)
  IF v_type = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'pending'
    WHERE id = v_source_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_revert_id, 'archive', 'source', v_source_id);
      v_did_anything := true;
    END IF;
  END IF;

  -- 타겟 changes의 역연산. 일반 규칙 하나로 모든 타입을 닫는다.
  FOR v_ch IN
    SELECT action, target_type, target_id FROM changes WHERE changeset_id = p_changeset_id
  LOOP
    IF v_ch.action IN ('create', 'restore') THEN
      v_inverse := 'archive';
    ELSIF v_ch.action = 'archive' THEN
      v_inverse := 'restore';
    ELSE
      CONTINUE;  -- modify는 reference 전용이고 되돌리기 미지원(§10 오픈)
    END IF;

    -- Reference의 create→archive 방향은 건너뛴다(공유 자원 보호).
    IF v_ch.target_type = 'reference' AND v_inverse = 'archive' THEN
      CONTINUE;
    END IF;

    IF v_inverse = 'archive' THEN
      IF v_ch.target_type = 'statement' THEN
        UPDATE statements SET status = 'archived', ingestion_status = 'pending'
        WHERE id = v_ch.target_id AND status = 'active';
        IF FOUND THEN v_touched_stmt := true; ELSE CONTINUE; END IF;
      ELSIF v_ch.target_type = 'relation' THEN
        UPDATE statement_relations SET status = 'archived'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'digest' THEN
        UPDATE digests SET status = 'archived'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'source' THEN  -- v2에서 "빼기"의 도착지는 pending
        UPDATE sources SET status = 'pending'
        WHERE id = v_ch.target_id AND status = 'active';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSE
        CONTINUE;  -- reference는 위에서 이미 걸러짐; 알 수 없는 타입 방어
      END IF;
    ELSE  -- restore
      IF v_ch.target_type = 'statement' THEN
        UPDATE statements SET status = 'active', ingestion_status = 'pending'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF FOUND THEN v_touched_stmt := true; ELSE CONTINUE; END IF;
      ELSIF v_ch.target_type = 'relation' THEN
        UPDATE statement_relations SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'digest' THEN
        UPDATE digests SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSIF v_ch.target_type = 'reference' THEN
        UPDATE "references" SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'archived';
        IF NOT FOUND THEN CONTINUE; END IF;
      ELSE  -- source: pending에서만 복귀 (trashed는 복원 RPC의 몫)
        UPDATE sources SET status = 'active'
        WHERE id = v_ch.target_id AND status = 'pending';
        IF NOT FOUND THEN CONTINUE; END IF;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

  IF NOT v_did_anything THEN
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id;
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 2) 백필 — 기존 revert changeset의 title·revert_depth
--
--   문자열을 파싱해 접미사 개수를 세는 대신, reverts_id 체인을 그래프로 직접
--   걸어 구조에서 depth·root title을 도출한다(이미 저장된 title 문자열이
--   신뢰 가능한 소스가 아니라 예전 접미사 로직의 결과물일 뿐이므로).
--
--   1) 비-revert changeset을 바로 되돌린 1차 revert: depth=1, title=원본 그대로.
--   2) revert가 revert를 되돌리는 체인(redo): 부모의 depth+1, title은 그대로
--      물려받는다. 고정점(fixed-point)에 이를 때까지 반복 — changeset_title
--      마이그레이션의 " 되돌림" 백필과 같은 루프 관용구.
--
--   trg_changesets_updated_at은 컬럼 무관 모든 UPDATE에 반응하는 범용 트리거라,
--   이 백필 동안은 꺼둔다(changeset_title 마이그레이션과 같은 이유 — 이미 closed
--   된 changeset들의 updated_at이 배포 시각으로 리셋되는 걸 막는다).
-- =============================================================

ALTER TABLE changesets DISABLE TRIGGER trg_changesets_updated_at;

UPDATE changesets r
SET title = orig.title,
    revert_depth = 1
FROM changesets orig
WHERE r.type = 'revert'
  AND r.reverts_id = orig.id
  AND orig.type <> 'revert'
  AND r.revert_depth = 0;

DO $$
DECLARE
  v_updated int;
BEGIN
  LOOP
    UPDATE changesets r
    SET title = parent.title,
        revert_depth = parent.revert_depth + 1
    FROM changesets parent
    WHERE r.type = 'revert'
      AND r.reverts_id = parent.id
      AND parent.type = 'revert'
      AND parent.revert_depth > 0
      AND r.revert_depth = 0;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXIT WHEN v_updated = 0;
  END LOOP;
END $$;

ALTER TABLE changesets ENABLE TRIGGER trg_changesets_updated_at;

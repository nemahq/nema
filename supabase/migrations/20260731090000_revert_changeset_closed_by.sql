-- revert_changeset — 즉시 closed+applied로 끝나는 flip형 되돌리기(manual·확신
-- 관계 대상, v_reopen_kind IS NULL)가 closed_by_id/closed_by_name을 채우지 않던
-- 누락을 고친다. changeset_closed_by 마이그레이션(20260729140000)이
-- confirm_ingestion_review/resolve_conflict_relation/resolve_duplicate_relation/
-- reject_pending_relation 전부에 이 컬럼을 채웠지만, 그 뒤 revert_changeset을
-- DROP+CREATE로 전면 재설계한 20260729153926이 이 INSERT를 그대로 옮기며
-- closed_by 컬럼을 빠뜨렸다 — closed_by_name이 NULL이면 "AI가 닫음"으로 읽히는
-- 컬럼 정의(위 마이그레이션 주석)상, 사람이 되돌리기 버튼을 눌러 즉시 확정되는
-- flip형 되돌리기가 전부 "AI가 닫음"으로 잘못 보이던 버그다. reopen 초안(open)은
-- 아직 아무도 안 닫았으므로 그대로 NULL 유지.
CREATE OR REPLACE FUNCTION revert_changeset(p_changeset_id uuid, p_title text)
RETURNS uuid AS $$
DECLARE
  v_space_id      uuid;
  v_type          changeset_type;
  v_status        changeset_status;
  v_outcome       changeset_outcome;
  v_source_id     uuid;
  v_author_id     uuid;
  v_revert_id     uuid;
  v_ch            record;
  v_did_anything  boolean := false;
  v_touched_stmt  boolean := false;
  v_inverse       change_action;
  v_reopen_kind   text;  -- 'ingestion' | 'relation' | NULL
BEGIN
  SELECT space_id, type, status, outcome, source_id
    INTO v_space_id, v_type, v_status, v_outcome, v_source_id
  FROM changesets
  WHERE id = p_changeset_id
    AND (
      auth.uid() IS NULL
      OR is_space_member(space_id)
      OR (
        space_id IS NULL
        AND EXISTS (
          SELECT 1 FROM changes ch
          JOIN "references" r ON r.id = ch.target_id
          WHERE ch.changeset_id = p_changeset_id
            AND ch.target_type = 'reference'
            AND is_workspace_member(r.workspace_id)
        )
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must not be empty';
  END IF;

  IF v_status <> 'closed' OR v_outcome IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'changeset % is not closed+applied — nothing to revert', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF (v_type = 'relation' OR v_type = 'revert')
     AND changeset_is_relation_judgment_shaped(p_changeset_id) THEN
    v_reopen_kind := 'relation';
  ELSIF v_type = 'ingestion'
     OR (v_type = 'revert' AND changeset_is_ingestion_shaped(p_changeset_id)) THEN
    v_reopen_kind := 'ingestion';
  ELSE
    v_reopen_kind := NULL;  -- manual, 확신 관계(supports/replaces/resolves) 등
  END IF;

  v_author_id := auth.uid();

  INSERT INTO changesets (
    space_id, type, status, outcome, reverts_id, author_id, author_name, title,
    source_id, draft_version, closed_by_id, closed_by_name
  )
  VALUES (
    v_space_id, 'revert',
    (CASE WHEN v_reopen_kind IS NOT NULL THEN 'open' ELSE 'closed' END)::changeset_status,
    (CASE WHEN v_reopen_kind IS NOT NULL THEN NULL ELSE 'applied' END)::changeset_outcome,
    p_changeset_id, v_author_id, resolve_user_display_name(v_author_id), p_title,
    CASE WHEN v_reopen_kind = 'ingestion' THEN v_source_id END,
    CASE WHEN v_reopen_kind = 'ingestion' THEN 1 END,
    CASE WHEN v_reopen_kind IS NULL THEN v_author_id END,
    CASE WHEN v_reopen_kind IS NULL THEN resolve_user_display_name(v_author_id) END
  )
  RETURNING id INTO v_revert_id;

  IF v_reopen_kind = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'pending'
    WHERE id = v_source_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_revert_id, 'archive', 'source', v_source_id);
      v_did_anything := true;
    END IF;
  END IF;

  FOR v_ch IN
    SELECT action, target_type, target_id FROM changes WHERE changeset_id = p_changeset_id
  LOOP
    IF v_ch.action IN ('create', 'restore') THEN
      v_inverse := 'archive';
    ELSIF v_ch.action = 'archive' THEN
      v_inverse := 'restore';
    ELSE
      CONTINUE;
    END IF;

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
      ELSE
        CONTINUE;
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
      ELSE
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

  IF v_reopen_kind = 'ingestion' THEN
    INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
    SELECT v_revert_id, 'create', 'digest', gen_random_uuid(), data, position
    FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create';
    v_did_anything := true;
  ELSIF v_reopen_kind = 'relation' THEN
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    SELECT v_revert_id, 'create', 'relation', gen_random_uuid(), data
    FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'relation' AND action = 'create'
      AND data->>'type' IN ('conflicts', 'duplicates');
    v_did_anything := true;
  END IF;

  IF NOT v_did_anything THEN
    RAISE EXCEPTION 'nothing to revert for changeset %', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF v_touched_stmt THEN
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

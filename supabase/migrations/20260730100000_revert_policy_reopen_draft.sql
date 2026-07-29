-- =============================================================
-- 되돌리기 정책 전면 개편 — ingestion/relation(충돌·중복 판정) 되돌리기는
-- 더 이상 즉시 closed+applied로 끝나지 않는다. 원본은 closed로 그대로 두고,
-- open 상태의 revert changeset 하나가 새로 열려 그 자체가 재판정 화면이
-- 된다 — 확정하면 (편집된) 내용이 다시 적용되고, 버리면 되돌려진 상태
-- 그대로 남는다. manual 되돌리기(Digest·Reference 직접 편집/아카이브)는
-- 판정할 게 없어(그 자체가 이미 단일 확정 액션이었으므로) 지금처럼
-- 즉시 closed+applied로 유지한다.
--
-- 복원 콘텐츠는 LLM 재호출 없이 changeset 자체 기록에서 그대로 가져온다.
--   - ingestion: 확정됐던 Digest create-Change의 data를 새 target_id로 복제.
--     Reference는 되돌리기에서도 이 재판정에서도 손대지 않는다 — create→archive
--     방향을 건너뛰는 기존 원칙(Workspace 공유 자원 보호)의 연장이다. Reference를
--     archive하지 않았으니 재추출도 필요 없다.
--   - relation(conflicts/duplicates): 엔진의 원래 제안 Change(그 안의 merge_draft
--     포함)를 새 target_id로 복제. 확신 관계(supports/replaces/resolves)는
--     애초에 사람 판정 화면이 없어 이 대상이 아니다 — manual과 같이 즉시
--     closed+applied로 유지된다.
--
-- "되돌려졌나"(is_changeset_reverted)도 갈라진다. manual·확신 관계처럼
-- archive/restore를 그대로 뒤집는 flip형은 짝수 번째 되돌리기마다 원래
-- 상태로 돌아오므로(redo) 기존처럼 재귀 패리티가 맞다. 반면 새로 여는
-- 재판정형은 매번 새 Digest/관계를 만들 뿐 원본을 문자 그대로 되살리지
-- 않으므로(진술·Digest id가 매번 새로 태어난다), 그 존재 자체가 원본을
-- 영구히 "되돌려짐"으로 확정한다 — 그 이후 재판정 초안이 열려있든·
-- 버려지든·확정되든 원본은 계속 되돌려진 상태다.
-- =============================================================

-- ----- 0) chk_changeset_shape — revert가 source_id를 가질 수 있게 완화 -----
--
-- ingestion 되돌리기의 재판정 초안은 confirm_ingestion_review 등 ingestion
-- 계열 RPC가 c.source_id로 원문을 찾아야 해서(§5) type='revert'인 채로도
-- source_id가 필요하다. relation 되돌리기의 재판정 초안·manual 되돌리기는
-- 지금처럼 source_id 없이 둔다 — 그래서 NULL 허용이지 필수가 아니다.
ALTER TABLE changesets DROP CONSTRAINT chk_changeset_shape;
ALTER TABLE changesets ADD CONSTRAINT chk_changeset_shape CHECK (
  (type = 'ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
  (type = 'relation'  AND source_id IS NOT NULL AND reverts_id IS NULL AND author_id IS NULL) OR
  (type = 'revert'    AND reverts_id IS NOT NULL) OR
  (type = 'manual'    AND reverts_id IS NULL)
);

-- ----- 1) revert_depth 폐기 — title을 생성 시점에 애플리케이션 코드가 완성된
-- 문자열로 조합해 저장하므로(TS revertChangeset), FE가 나중에 접미사를 조합할
-- 재료(revert_depth)가 더 이상 필요 없다. -----
ALTER TABLE changesets DROP COLUMN revert_depth;

-- ----- 2) changeset_is_ingestion_shaped / changeset_is_relation_judgment_shaped —
-- 이 changeset이 "재판정 가능한 초안"을 담고 있는지 구분하는 술어. type이 아니라
-- changes의 실제 모양으로 판정한다 — type='revert'인 changeset도 그 안에 digest
-- create나 conflicts/duplicates 제안이 있으면 똑같이 재판정형이기 때문이다(되돌린
-- 뒤 확정된 재판정을 다시 되돌리는 체이닝도 이 판정 하나로 자연히 처리된다). -----
CREATE OR REPLACE FUNCTION changeset_is_ingestion_shaped(p_changeset_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM changes
    WHERE changeset_id = p_changeset_id
      AND target_type = 'digest' AND action = 'create'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION changeset_is_relation_judgment_shaped(p_changeset_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM changes
    WHERE changeset_id = p_changeset_id
      AND target_type = 'relation' AND action = 'create'
      AND data->>'type' IN ('conflicts', 'duplicates')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION changeset_is_ingestion_shaped FROM public, anon;
GRANT EXECUTE ON FUNCTION changeset_is_ingestion_shaped TO authenticated, service_role;
REVOKE ALL ON FUNCTION changeset_is_relation_judgment_shaped FROM public, anon;
GRANT EXECUTE ON FUNCTION changeset_is_relation_judgment_shaped TO authenticated, service_role;

-- ----- 3) is_changeset_reverted — flip형(manual·확신 관계)은 기존 재귀 패리티
-- 그대로, 재판정형(ingestion·relation 판정) 자녀는 존재만으로 즉시 확정 -----
CREATE OR REPLACE FUNCTION is_changeset_reverted(p_changeset_id uuid)
RETURNS boolean AS $$
DECLARE
  v_child uuid;
BEGIN
  FOR v_child IN
    SELECT id FROM changesets WHERE reverts_id = p_changeset_id
  LOOP
    IF changeset_is_ingestion_shaped(v_child)
       OR changeset_is_relation_judgment_shaped(v_child) THEN
      RETURN true;
    END IF;
    IF NOT is_changeset_reverted(v_child) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ----- 4) revert_changeset — p_title(애플리케이션 코드가 UI 언어로 미리 조합한
-- 완성 문자열)을 받아 그대로 저장. ingestion/relation(충돌·중복) 대상이면
-- 재판정 초안을 open으로 새로 열고, 그 외(manual·확신 관계)는 기존처럼 즉시
-- closed+applied. 시그니처가 바뀌어 CREATE OR REPLACE로 못 덮는다(인자 개수가
-- 늘어 오버로드가 생기므로 DROP 후 재생성, supabase/CLAUDE.md 관례). -----
DROP FUNCTION revert_changeset(uuid);

CREATE FUNCTION revert_changeset(p_changeset_id uuid, p_title text)
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
  -- 동시에 같은 changeset을 되돌리는 두 요청이 경합하면(더블클릭 등), 잠금 없이는
  -- 둘 다 is_changeset_reverted 통과 후 각자 독립된 open 재판정 초안을 만들어버릴
  -- 수 있다 — 그중 하나가 확정되면 나머지 하나는 존재 자체가 유령이 된다. 이
  -- 함수의 나머지 흐름이 전부 이 행 하나에 대한 배타적 판단(이미 되돌려졌는지,
  -- 어떤 초안을 열지)이므로 잠가서 두 번째 요청이 첫 번째가 끝난 뒤의 최신
  -- 상태(대개 "이미 되돌려짐")를 보게 한다.
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must not be empty';
  END IF;

  -- 되돌리기 버튼은 "지금 그래프에 살아있는 걸 만든 행"에만 붙는다 — open(아직
  -- 확정 전 초안)이나 discarded(적용된 적 없음)는 되돌릴 게 없다. 이 가드가
  -- 없으면, 예를 들어 ingestion 되돌리기가 연 open 재판정 초안을 확정 전에 또
  -- 되돌리려 할 때 "재판정 초안의 source archive" 역연산(=원문을 다시
  -- active로)만 조용히 실행되고 나머지(아직 실체 없는 digest 등)는 전부
  -- no-op으로 스킵돼 어중간한 상태가 된다.
  IF v_status <> 'closed' OR v_outcome IS DISTINCT FROM 'applied' THEN
    RAISE EXCEPTION 'changeset % is not closed+applied — nothing to revert', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  IF is_changeset_reverted(p_changeset_id) THEN
    RAISE EXCEPTION 'changeset % is already reverted', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  -- 재판정 대상 판별 — type='revert'도 그 안의 changes 모양으로 같은 자격을
  -- 얻는다(되돌린 뒤 확정된 재판정을 다시 되돌리는 체이닝도 이 판정 하나로
  -- 처리된다). relation-shaped 판정을 먼저 본다 — 확정된 duplicates 재판정
  -- (type='revert')은 resolve_duplicate_relation이 병합 Digest의 create/digest
  -- 행을 얹어놓아 changeset_is_ingestion_shaped도 true가 되므로, ingestion을
  -- 먼저 보면 duplicates 재판정 되돌리기가 ingestion으로 잘못 분류된다. 반대
  -- 방향은 안전하다 — 순수 ingestion changeset은 애초에 conflicts/duplicates
  -- 제안(create/relation)을 만들지 않는다.
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
    source_id, draft_version
  )
  VALUES (
    v_space_id, 'revert',
    (CASE WHEN v_reopen_kind IS NOT NULL THEN 'open' ELSE 'closed' END)::changeset_status,
    (CASE WHEN v_reopen_kind IS NOT NULL THEN NULL ELSE 'applied' END)::changeset_outcome,
    p_changeset_id, v_author_id, resolve_user_display_name(v_author_id), p_title,
    CASE WHEN v_reopen_kind = 'ingestion' THEN v_source_id END,
    CASE WHEN v_reopen_kind = 'ingestion' THEN 1 END
  )
  RETURNING id INTO v_revert_id;

  -- ingestion 예외: changes 밖의 원문(source_id)도 pending으로 되돌린다
  -- ("글 통째로" — v2에선 archive가 아니라 pending 복귀, 07-modeling.md). 재판정
  -- 초안이 열리는 경우도 확인 모달 없이 즉시 적용되는 효과다. v_reopen_kind로
  -- 판정한다(v_type이 아니다) — type='revert'인 확정된 재판정(예: 한 번 되돌린
  -- ingestion을 확정한 뒤 그 changeset을 또 되돌리는 체이닝)도 이 예외 대상이다.
  -- v_type만 보면 이 경우를 놓쳐 원문이 active인 채로 방치되고, 그 원문에 대해
  -- 열린 리뷰가 없다는 가드가 있는 restore_ingestion_review·재추출 양쪽 모두
  -- 이 상태를 다시 되돌릴 방법을 못 찾아 changeset이 영구히 고립된다.
  IF v_reopen_kind = 'ingestion' AND v_source_id IS NOT NULL THEN
    UPDATE sources SET status = 'pending'
    WHERE id = v_source_id AND status = 'active';
    IF FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id)
      VALUES (v_revert_id, 'archive', 'source', v_source_id);
      v_did_anything := true;
    END IF;
  END IF;

  -- 타겟 changes의 역연산. 일반 규칙 하나로 모든 타입을 닫는다 — 재판정
  -- 초안을 여는 경우도 원본이 만든 걸 archive/restore로 되돌리는 이 효과
  -- 자체는 그대로다(달라지는 건 새로 태어나는 revert 행의 status·내용뿐).
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
      ELSE
        -- source는 여기서 재연산하지 않는다 — 아래 참고. reference는 위에서
        -- 이미 걸러짐; 그 외는 알 수 없는 타입 방어.
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
        -- source는 여기서 재연산하지 않는다. target_type='source' change 행은
        -- 오직 이 함수의 "ingestion 예외" 블록만 만들고(그 changeset 자신이
        -- source를 pending으로 되돌렸다는 기록), 이 changeset을 다시 되돌릴 땐
        -- 그 예외 블록이 v_reopen_kind 기준으로 다시 정확히 판단한다(그때는
        -- confirm_ingestion_review가 source를 active로 되돌린 뒤이므로). 만약
        -- 여기서도 이 행을 재연산하면 "ingestion 예외" 블록이 방금 pending으로
        -- 되돌린 걸 이 루프가 다시 active로 되돌리는 이중 처리가 된다(체이닝된
        -- ingestion 되돌리기 회귀 테스트가 잡던 버그).
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (v_revert_id, v_inverse, v_ch.target_type, v_ch.target_id);
    v_did_anything := true;
  END LOOP;

  -- 재판정 초안 채우기 — LLM 재호출 없이 이 changeset 자체가 기록한 데이터를
  -- 새 target_id로 복제한다. Reference는 애초에 archive되지 않으므로(위
  -- 루프에서 건너뜀) 복제 대상이 아니다 — Digest의 reference_ids는 이미
  -- 실제(영구) Reference id를 담고 있어 그대로 유효하다.
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

REVOKE ALL ON FUNCTION revert_changeset(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION revert_changeset(uuid, text) TO authenticated, service_role;

-- revertChangeset(TS)이 제목을 조합하려면 되돌릴 대상의 title/number를 RPC 호출
-- 전에 먼저 읽어야 하는데, 일반 SELECT는 RLS(is_space_member)만 통과한다 —
-- revert_changeset 자신의 접근 가드(위 §4)는 space_id가 NULL인 Reference manual
-- changeset도 그 Reference의 workspace 멤버십으로 통과시키는 더 넓은 규칙이라,
-- 이 사전 조회만 RLS로 좁게 읽으면 그 케이스에서 조회가 먼저 막혀버린다(RPC는
-- 통과할 텐데도). 같은 가드를 그대로 복제해 이 조회도 RPC로 넓힌다.
CREATE OR REPLACE FUNCTION get_changeset_title_and_number(p_changeset_id uuid)
RETURNS TABLE(title text, number int) AS $$
  SELECT cs.title, cs.number
  FROM changesets cs
  WHERE cs.id = p_changeset_id
    AND (
      auth.uid() IS NULL
      OR is_space_member(cs.space_id)
      OR (
        cs.space_id IS NULL
        AND EXISTS (
          SELECT 1 FROM changes ch
          JOIN "references" r ON r.id = ch.target_id
          WHERE ch.changeset_id = cs.id
            AND ch.target_type = 'reference'
            AND is_workspace_member(r.workspace_id)
        )
      )
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_changeset_title_and_number FROM public, anon;
GRANT EXECUTE ON FUNCTION get_changeset_title_and_number TO authenticated, service_role;

-- ----- 5) ingestion 계열 RPC — type='revert'인 재판정 초안(§4)도 같은 화면·
-- 확정/버리기/되살리기 경로를 그대로 탄다. type IN ('ingestion','revert')로
-- 넓히되, 판별은 status/outcome 가드만으로 충분하다 — type='revert'가
-- status='open'이 되는 경로는 revert_changeset의 재판정 분기
-- (v_reopen_kind='ingestion')뿐이라 애매함이 없다(relation 재판정 초안은
-- §6의 화면 전용 RPC만 받아들인다). -----
CREATE OR REPLACE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_author_id    uuid;
  v_author_name  text;
  v_closed_by_id uuid;
  v_workspace_id uuid;
  ch             record;
  v_name         text;
  v_topic_id     uuid;
  v_tag          jsonb;
  v_tag_id       uuid;
  v_ref          text;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.type
    INTO v_space_id, v_source_id, v_status, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;

  -- 원문이 리뷰 대기 상태여야 한다 — 휴지통으로 간 원문의 리뷰는 확정 불가
  SELECT s.author_id, s.author_name, sp.workspace_id INTO v_author_id, v_author_name, v_workspace_id
  FROM sources s JOIN spaces sp ON sp.id = s.space_id
  WHERE s.id = v_source_id AND s.status = 'pending'
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not awaiting review', v_source_id;
  END IF;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
  LOOP
    INSERT INTO "references" (id, workspace_id, type, title, body, external_urls)
    VALUES (
      ch.target_id, v_workspace_id,
      (ch.data->>'type')::reference_type, ch.data->>'title', ch.data->>'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END
    );
  END LOOP;

  -- 기존 Reference 병합 반영 — after.body로 통째 교체(updated_at은 트리거가 갱신).
  -- 저장~확정 사이 그 Reference가 정리(archive/trash)됐으면 사람이 쓴 병합이 조용히
  -- 유실된 채 확정만 성공한다 — status 가드에 0행이 걸리면 NM008로 막아 새로고침을
  -- 유도한다(update_pending의 저장 시 검사와 같은 취지, 그 사이 창을 여기서 닫는다).
  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'modify'
  LOOP
    UPDATE "references"
    SET body = ch.data->'after'->>'body'
    WHERE id = ch.target_id AND workspace_id = v_workspace_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'reference % was archived or removed since review — refresh', ch.target_id
        USING ERRCODE = 'NM008';
    END IF;
  END LOOP;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
  LOOP
    INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name)
    VALUES (
      ch.target_id, v_source_id, v_space_id,
      ch.data->>'title', ch.data->>'description', ch.data->'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END,
      v_author_id, v_author_name
    );

    FOR v_name IN
      SELECT value->>'title' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_name, '')) = '';
      INSERT INTO topics (space_id, title)
      VALUES (v_space_id, btrim(v_name))
      ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
      RETURNING id INTO v_topic_id;

      INSERT INTO digest_topics (digest_id, topic_id)
      VALUES (ch.target_id, v_topic_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_tag IN
      SELECT value FROM jsonb_array_elements(coalesce(ch.data->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
      INSERT INTO tags (workspace_id, title, description, color)
      VALUES (
        v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''),
        coalesce((v_tag->>'color')::tag_color, random_tag_color())
      )
      ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
      RETURNING id INTO v_tag_id;

      INSERT INTO digest_tags (digest_id, tag_id)
      VALUES (ch.target_id, v_tag_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_ref IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'reference_ids', '[]'::jsonb))
    LOOP
      INSERT INTO digest_references (digest_id, reference_id)
      VALUES (ch.target_id, v_ref::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'applied',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원문 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION discard_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_closed_by_id uuid;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.type
    INTO v_space_id, v_source_id, v_status, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review the caller can discard', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE sources SET status = 'pending'
  WHERE id = v_source_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending — cannot discard a review whose source drifted', v_source_id
      USING ERRCODE = 'NM008';
  END IF;

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'discarded',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION restore_ingestion_review(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_space_id  uuid;
  v_source_id uuid;
  v_status    changeset_status;
  v_outcome   changeset_outcome;
  v_type      changeset_type;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.outcome, c.type
    INTO v_space_id, v_source_id, v_status, v_outcome, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'closed' OR v_outcome IS DISTINCT FROM 'discarded' THEN
    RAISE EXCEPTION 'changeset % is not a discarded ingestion review the caller can restore', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM sources WHERE id = v_source_id AND status = 'pending') THEN
    RAISE EXCEPTION 'source % is not pending — cannot restore a review over a trashed source', v_source_id
      USING ERRCODE = 'NM008';
  END IF;

  UPDATE changesets
  SET status = 'open', outcome = NULL, closed_by_id = NULL, closed_by_name = NULL
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_pending_ingestion(
  p_changeset_id      uuid,
  p_expected_version  integer,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS integer AS $$
DECLARE
  v_status       changeset_status;
  v_type         changeset_type;
  v_version      integer;
  v_new_version  integer;
  v_item         jsonb;
  v_ref_id       uuid;
  v_digest_id    uuid;
  v_ref_ids      jsonb;
  v_before       text;
  v_cited_keys   jsonb;
  v_keep_refs    uuid[] := '{}';
  v_keep_digests uuid[] := '{}';
BEGIN
  SELECT status, type, draft_version INTO v_status, v_type, v_version
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_type NOT IN ('ingestion', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open ingestion review', p_changeset_id
      USING ERRCODE = 'NM008';
  END IF;
  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — trash the source instead';
  END IF;

  IF v_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'ingestion review % draft version mismatch (expected %, got %) — refresh',
      p_changeset_id, v_version, p_expected_version
      USING ERRCODE = 'NM012';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_reference_updates, '[]'::jsonb)) AS upd(value)
    JOIN changesets c ON c.id = p_changeset_id
    JOIN spaces sp ON sp.id = c.space_id
    LEFT JOIN "references" r
      ON r.id = (upd.value->>'reference_id')::uuid
     AND r.workspace_id = sp.workspace_id
     AND r.status = 'active'
    WHERE r.id IS NULL
  ) THEN
    RAISE EXCEPTION 'a reference being merged was archived or removed since review — refresh'
      USING ERRCODE = 'NM008';
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT cited.key), '[]'::jsonb) INTO v_cited_keys
  FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb)) AS digest(value),
       jsonb_array_elements_text(coalesce(digest.value->'new_reference_keys', '[]'::jsonb)) AS cited(key);

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    CONTINUE WHEN NOT (v_cited_keys ? (v_item->>'id'));
    v_ref_id := (v_item->>'id')::uuid;
    v_keep_refs := array_append(v_keep_refs, v_ref_id);

    UPDATE changes
    SET data = jsonb_build_object(
          'type',          v_item->>'type',
          'title',         v_item->>'title',
          'body',          v_item->>'body',
          'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
        ),
        position = (v_item->>'position')::integer
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
      AND target_id = v_ref_id;

    IF NOT FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
      VALUES (
        p_changeset_id, 'create', 'reference', v_ref_id,
        jsonb_build_object(
          'type',          v_item->>'type',
          'title',         v_item->>'title',
          'body',          v_item->>'body',
          'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
        ),
        (v_item->>'position')::integer
      );
    END IF;
  END LOOP;

  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
    AND NOT (target_id = ANY(v_keep_refs));

  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'modify';

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_reference_updates, '[]'::jsonb))
  LOOP
    SELECT r.body INTO v_before
    FROM "references" r
    JOIN changesets c ON c.id = p_changeset_id
    JOIN spaces sp ON sp.id = c.space_id
    WHERE r.id = (v_item->>'reference_id')::uuid
      AND r.status = 'active'
      AND r.workspace_id = sp.workspace_id;
    CONTINUE WHEN NOT FOUND;
    CONTINUE WHEN v_before IS NOT DISTINCT FROM (v_item->>'body');

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'modify', 'reference', (v_item->>'reference_id')::uuid,
      jsonb_build_object(
        'before', jsonb_build_object('body', v_before),
        'after',  jsonb_build_object('body', v_item->>'body')
      )
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    v_digest_id := (v_item->>'id')::uuid;
    v_keep_digests := array_append(v_keep_digests, v_digest_id);

    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT value #>> '{}' AS ref_id FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs
    WHERE refs.ref_id IS NOT NULL;

    UPDATE changes
    SET data = (v_item - 'new_reference_keys' - 'id' - 'position') || jsonb_build_object('reference_ids', v_ref_ids),
        position = (v_item->>'position')::integer
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
      AND target_id = v_digest_id;

    IF NOT FOUND THEN
      INSERT INTO changes (changeset_id, action, target_type, target_id, data, position)
      VALUES (
        p_changeset_id, 'create', 'digest', v_digest_id,
        (v_item - 'new_reference_keys' - 'id' - 'position') || jsonb_build_object('reference_ids', v_ref_ids),
        (v_item->>'position')::integer
      );
    END IF;
  END LOOP;

  DELETE FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
    AND NOT (target_id = ANY(v_keep_digests));

  UPDATE changesets SET draft_version = draft_version + 1
  WHERE id = p_changeset_id
  RETURNING draft_version INTO v_new_version;

  RETURN v_new_version;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 6) relation 계열 RPC — type='revert'인 재판정 초안(§4, conflicts/duplicates
-- 제안 복제)도 관계 판정 화면의 확정·거절·되살리기 경로를 그대로 탄다. -----
CREATE OR REPLACE FUNCTION resolve_conflict_relation(
  p_changeset_id        uuid,
  p_winner_statement_id uuid
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_rel_type     text;
  v_from_id      uuid;
  v_to_id        uuid;
  v_loser_id     uuid;
  v_relation_id  uuid;
  v_existing     record;
  v_closed_by_id uuid;
BEGIN
  SELECT space_id, status, type INTO v_space_id, v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('relation', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not an open relation proposal', p_changeset_id;
  END IF;

  SELECT data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation' AND action = 'create'
    AND data->>'type' IN ('conflicts', 'duplicates')
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open relation changeset % has no relation change', p_changeset_id;
  END IF;
  IF v_rel_type <> 'conflicts' THEN
    RAISE EXCEPTION 'changeset % is not a conflicts proposal (use resolve_duplicate_relation)', p_changeset_id;
  END IF;

  IF p_winner_statement_id = v_from_id THEN
    v_loser_id := v_to_id;
  ELSIF p_winner_statement_id = v_to_id THEN
    v_loser_id := v_from_id;
  ELSE
    RAISE EXCEPTION 'winner % is not an endpoint of changeset %', p_winner_statement_id, p_changeset_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM statements WHERE id = v_from_id AND status = 'active')
     OR NOT EXISTS (SELECT 1 FROM statements WHERE id = v_to_id AND status = 'active') THEN
    RAISE EXCEPTION 'endpoint no longer active for relation proposal %', p_changeset_id;
  END IF;

  SELECT id, status INTO v_existing
  FROM statement_relations
  WHERE from_id = p_winner_statement_id AND to_id = v_loser_id AND type = 'replaces';

  IF NOT FOUND THEN
    INSERT INTO statement_relations (space_id, type, from_id, to_id)
    VALUES (v_space_id, 'replaces', p_winner_statement_id, v_loser_id)
    RETURNING id INTO v_relation_id;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'relation', v_relation_id,
      jsonb_build_object(
        'type', 'replaces', 'from_id', p_winner_statement_id, 'to_id', v_loser_id
      )
    );
  ELSIF v_existing.status = 'archived' THEN
    UPDATE statement_relations SET status = 'active' WHERE id = v_existing.id;
    v_relation_id := v_existing.id;

    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (p_changeset_id, 'restore', 'relation', v_relation_id);
  ELSE
    v_relation_id := v_existing.id;
  END IF;

  UPDATE statements
  SET status = 'archived', ingestion_status = 'pending'
  WHERE id = v_loser_id AND status = 'active';

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'statement', v_loser_id);

  PERFORM invalidate_stale_relation_proposals(v_loser_id, p_changeset_id);

  v_closed_by_id := auth.uid();
  UPDATE changesets
  SET status = 'closed', outcome = 'applied',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_relation_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION resolve_duplicate_relation(
  p_changeset_id   uuid,
  p_merged_digest  jsonb,
  p_new_references jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id       uuid;
  v_status         changeset_status;
  v_type           changeset_type;
  v_rel_type       text;
  v_from_id        uuid;
  v_to_id          uuid;
  v_digest_a       uuid;
  v_digest_b       uuid;
  v_source_id      uuid;
  v_workspace_id   uuid;
  v_author_id      uuid;
  v_author_name    text;
  v_new_digest     uuid;
  v_key_ids        jsonb := '{}'::jsonb;
  v_ref_id         uuid;
  v_ref_ids        jsonb;
  v_item           jsonb;
  v_name           text;
  v_topic_id       uuid;
  v_tag            jsonb;
  v_tag_id         uuid;
  v_ref            text;
  v_stmt           uuid;
BEGIN
  SELECT space_id, status, type INTO v_space_id, v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type NOT IN ('relation', 'revert') OR v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is not a pending relation proposal', p_changeset_id;
  END IF;

  SELECT data->>'type', (data->>'from_id')::uuid, (data->>'to_id')::uuid
    INTO v_rel_type, v_from_id, v_to_id
  FROM changes
  WHERE changeset_id = p_changeset_id AND target_type = 'relation' AND action = 'create'
    AND data->>'type' IN ('conflicts', 'duplicates')
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'pending relation changeset % has no relation change', p_changeset_id;
  END IF;
  IF v_rel_type <> 'duplicates' THEN
    RAISE EXCEPTION 'changeset % is not a duplicates proposal (use resolve_conflict_relation)', p_changeset_id;
  END IF;

  SELECT digest_id INTO v_digest_a FROM statements WHERE id = v_from_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'endpoint % no longer active for relation proposal %', v_from_id, p_changeset_id;
  END IF;
  SELECT digest_id INTO v_digest_b FROM statements WHERE id = v_to_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'endpoint % no longer active for relation proposal %', v_to_id, p_changeset_id;
  END IF;

  IF v_digest_a = v_digest_b THEN
    RAISE EXCEPTION 'duplicate statements % and % belong to the same digest % — merge does not apply', v_from_id, v_to_id, v_digest_a;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM digests WHERE id = v_digest_a AND status = 'active' AND space_id = v_space_id)
     OR NOT EXISTS (SELECT 1 FROM digests WHERE id = v_digest_b AND status = 'active' AND space_id = v_space_id) THEN
    RAISE EXCEPTION 'endpoint digest no longer active or space mismatch for relation proposal %', p_changeset_id;
  END IF;

  SELECT source_id INTO v_source_id FROM digests WHERE id = v_digest_b;
  SELECT workspace_id INTO v_workspace_id FROM spaces WHERE id = v_space_id;

  v_author_id := auth.uid();
  v_author_name := resolve_user_display_name(v_author_id);

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO "references" (id, workspace_id, type, title, body, external_urls)
    VALUES (
      v_ref_id, v_workspace_id,
      (v_item->>'type')::reference_type, v_item->>'title', v_item->>'body',
      CASE WHEN jsonb_array_length(coalesce(v_item->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(v_item->'external_urls'))
      END
    );
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (p_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type', v_item->>'type', 'title', v_item->>'title', 'body', v_item->>'body',
        'external_urls', coalesce(v_item->'external_urls', '[]'::jsonb)
      ));
  END LOOP;

  SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
  FROM (
    SELECT value #>> '{}' AS ref_id
    FROM jsonb_array_elements(coalesce(p_merged_digest->'reference_ids', '[]'::jsonb))
    UNION ALL
    SELECT v_key_ids ->> (value #>> '{}')
    FROM jsonb_array_elements(coalesce(p_merged_digest->'new_reference_keys', '[]'::jsonb))
  ) refs
  WHERE refs.ref_id IS NOT NULL;

  v_new_digest := gen_random_uuid();
  INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id, author_name, extraction_status)
  VALUES (
    v_new_digest, v_source_id, v_space_id,
    p_merged_digest->>'title', p_merged_digest->>'description', p_merged_digest->'body',
    CASE WHEN jsonb_array_length(coalesce(p_merged_digest->'external_urls', '[]'::jsonb)) > 0
      THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(p_merged_digest->'external_urls'))
    END,
    v_author_id, v_author_name, 'pending'
  );

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (p_changeset_id, 'create', 'digest', v_new_digest,
    (p_merged_digest - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids));

  FOR v_name IN SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(p_merged_digest->'topics', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(v_name) = '';
    INSERT INTO topics (space_id, title)
    VALUES (v_space_id, btrim(v_name))
    ON CONFLICT (space_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_topic_id;
    INSERT INTO digest_topics (digest_id, topic_id)
    VALUES (v_new_digest, v_topic_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_tag IN SELECT value FROM jsonb_array_elements(coalesce(p_merged_digest->'tags', '[]'::jsonb))
  LOOP
    CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
    INSERT INTO tags (workspace_id, title, description)
    VALUES (v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''))
    ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
    RETURNING id INTO v_tag_id;
    INSERT INTO digest_tags (digest_id, tag_id)
    VALUES (v_new_digest, v_tag_id) ON CONFLICT DO NOTHING;
  END LOOP;

  FOR v_ref IN SELECT value #>> '{}' FROM jsonb_array_elements(v_ref_ids)
  LOOP
    INSERT INTO digest_references (digest_id, reference_id)
    VALUES (v_new_digest, v_ref::uuid) ON CONFLICT DO NOTHING;
  END LOOP;

  UPDATE digests SET status = 'archived' WHERE id IN (v_digest_a, v_digest_b);
  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'digest', v_digest_a);
  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (p_changeset_id, 'archive', 'digest', v_digest_b);

  FOR v_stmt IN
    SELECT id FROM statements WHERE digest_id IN (v_digest_a, v_digest_b) AND status = 'active'
  LOOP
    UPDATE statements SET status = 'archived', ingestion_status = 'pending' WHERE id = v_stmt;
    INSERT INTO changes (changeset_id, action, target_type, target_id)
    VALUES (p_changeset_id, 'archive', 'statement', v_stmt);
    PERFORM invalidate_stale_relation_proposals(v_stmt, p_changeset_id);
  END LOOP;

  UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
  WHERE id = v_source_id;

  UPDATE changesets
  SET status = 'closed', outcome = 'applied', title = p_merged_digest->>'title',
      closed_by_id = v_author_id, closed_by_name = v_author_name
  WHERE id = p_changeset_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_new_digest;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION reject_pending_relation(p_changeset_id uuid)
RETURNS void AS $$
DECLARE
  v_closed_by_id uuid;
BEGIN
  v_closed_by_id := auth.uid();

  UPDATE changesets
  SET status = 'closed', outcome = 'discarded',
      closed_by_id = v_closed_by_id, closed_by_name = resolve_user_display_name(v_closed_by_id)
  WHERE id = p_changeset_id
    AND type IN ('relation', 'revert') AND status = 'open'
    AND (v_closed_by_id IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % is not an open relation proposal the caller can reject', p_changeset_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION restore_pending_relation(p_changeset_id uuid)
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
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_type NOT IN ('relation', 'revert') OR v_status <> 'closed'
     OR v_outcome IS DISTINCT FROM 'discarded'
     OR v_invalidated_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'changeset % is not a discarded pending relation changeset the caller can restore', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;

  -- action='create'만 걸러 뽑는다(data->>'type' 값 제한 없음) — 이 changeset이
  -- discarded될 수 있는 타입은 conflicts/duplicates 외에 저확신 supports 등도
  -- 있다(reject_pending_relation은 relation_type 무관). type='revert'인 재판정
  -- 초안이라면 되돌리기 즉시효과의 archive/restore 행(data 없음)이 섞여 있을 수
  -- 있는데, create만 걸러도 그 행들과 안 겹친다(create/modify만 data를 갖는다는
  -- chk_data_by_action 불변식).
  SELECT (ch.data->>'type')::relation_type,
         (ch.data->>'from_id')::uuid,
         (ch.data->>'to_id')::uuid
    INTO v_relation_type, v_from_id, v_to_id
  FROM changes ch
  WHERE ch.changeset_id = p_changeset_id AND ch.target_type = 'relation' AND ch.action = 'create'
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
    RAISE EXCEPTION 'a relation changeset for the same statement pair is already open'
      USING ERRCODE = 'NM013';
  END IF;

  UPDATE changesets
  SET status = 'open', outcome = NULL, closed_by_id = NULL, closed_by_name = NULL
  WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 7) restore_digest / restore_reference — revert_changeset 시그니처가
-- 바뀌어(§4, p_title 필수) 이 둘도 그대로 두면 존재하지 않는 오버로드를 불러
-- 깨진다. p_title을 받아 그대로 넘겨준다 — 제목 조합은 TS 쪽(digest-service.ts
-- /reference-service.ts)이 find_manual_archive_changeset으로 대상 changeset의
-- title/number를 먼저 읽어 UI 언어로 조합한다(revertChangeset과 같은 패턴).
-- 재판정형 revert changeset(ingestion 또는 relation 판정을 되돌려 연 open/confirmed
-- 초안)은 "이 digest/reference를 archive한 changeset"으로 잡혀도 안 된다 — 그걸
-- revert_changeset으로 되돌리면 이 digest/reference를 복원하는 게 아니라 전혀 다른
-- 대상(재판정 초안 자신의 draft 콘텐츠)을 archive하고 또 다른 open 초안을 열어버린다
-- (resolve_duplicate_relation의 병합 Digest confirm처럼, 원래 관계없는 create/digest
-- 행이 만들의 changeset에 같이 실릴 수 있어 "이 changeset이 digest를 만든 적 있는가"
-- 만으로는 못 가른다). type='manual'인 confirm_digest_edit도 옛 Digest
-- archive+새 Digest create를 같은 changeset에 담지만, 그건 type이 애초에 'revert'가
-- 아니라 이 판정 대상이 아니다 — manual의 되돌리기(플립형)는 그대로 유효한 복원
-- 경로로 남아야 한다.
CREATE OR REPLACE FUNCTION is_reopen_shaped_revert(p_changeset_id uuid)
RETURNS boolean AS $$
  SELECT cs.type = 'revert'
    AND (changeset_is_ingestion_shaped(cs.id) OR changeset_is_relation_judgment_shaped(cs.id))
  FROM changesets cs
  WHERE cs.id = p_changeset_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION is_reopen_shaped_revert FROM public, anon;
GRANT EXECUTE ON FUNCTION is_reopen_shaped_revert TO authenticated, service_role;

CREATE OR REPLACE FUNCTION find_manual_archive_changeset(
  p_target_type change_target_type,
  p_target_id   uuid
)
RETURNS TABLE(changeset_id uuid, title text, number int) AS $$
  SELECT cs.id, cs.title, cs.number
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = p_target_type AND ch.target_id = p_target_id AND ch.action = 'archive'
    AND cs.type IN ('manual', 'revert')
    AND NOT is_reopen_shaped_revert(cs.id)
    AND (
      auth.uid() IS NULL
      OR (p_target_type = 'digest' AND EXISTS (
        SELECT 1 FROM digests d WHERE d.id = p_target_id AND is_space_member(d.space_id)
      ))
      OR (p_target_type = 'reference' AND EXISTS (
        SELECT 1 FROM "references" r WHERE r.id = p_target_id AND is_workspace_member(r.workspace_id)
      ))
    )
  ORDER BY ch.created_at DESC, ch.id DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION find_manual_archive_changeset FROM public, anon;
GRANT EXECUTE ON FUNCTION find_manual_archive_changeset TO authenticated, service_role;

DROP FUNCTION restore_digest(uuid);

CREATE FUNCTION restore_digest(p_digest_id uuid, p_title text)
RETURNS uuid AS $$
DECLARE
  v_changeset_id      uuid;
  v_revert_id         uuid;
  v_source_id         uuid;
  v_extraction_status ingestion_status;
BEGIN
  SELECT source_id, extraction_status INTO v_source_id, v_extraction_status
  FROM digests
  WHERE id = p_digest_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'digest % is not an archived digest the caller can restore', p_digest_id
      USING ERRCODE = 'NM010';
  END IF;

  SELECT ch.changeset_id INTO v_changeset_id
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = 'digest' AND ch.target_id = p_digest_id AND ch.action = 'archive'
    AND cs.type IN ('manual', 'revert')
    AND NOT is_reopen_shaped_revert(cs.id)
  ORDER BY ch.created_at DESC, ch.id DESC
  LIMIT 1;

  IF v_changeset_id IS NULL THEN
    RAISE EXCEPTION 'digest % has no archiving changeset to revert', p_digest_id
      USING ERRCODE = 'NM010';
  END IF;

  v_revert_id := revert_changeset(v_changeset_id, p_title);

  IF v_extraction_status = 'pending' THEN
    UPDATE sources SET extraction_status = 'pending', linking_status = 'pending'
    WHERE id = v_source_id;
    PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
  END IF;

  RETURN v_revert_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION restore_digest(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_digest(uuid, text) TO authenticated, service_role;

DROP FUNCTION restore_reference(uuid);

CREATE FUNCTION restore_reference(p_reference_id uuid, p_title text)
RETURNS uuid AS $$
DECLARE
  v_changeset_id uuid;
BEGIN
  PERFORM 1 FROM "references"
  WHERE id = p_reference_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an archived reference the caller can restore', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  SELECT ch.changeset_id INTO v_changeset_id
  FROM changes ch
  JOIN changesets cs ON cs.id = ch.changeset_id
  WHERE ch.target_type = 'reference' AND ch.target_id = p_reference_id AND ch.action = 'archive'
    AND cs.type IN ('manual', 'revert')
    AND NOT is_reopen_shaped_revert(cs.id)
  ORDER BY ch.created_at DESC, ch.id DESC
  LIMIT 1;

  IF v_changeset_id IS NULL THEN
    RAISE EXCEPTION 'reference % has no archiving changeset to revert', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  RETURN revert_changeset(v_changeset_id, p_title);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION restore_reference(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_reference(uuid, text) TO authenticated, service_role;

-- ----- 8) update_changeset_title — 제목 편집 가능 여부는 이제 타입이 아니라
-- status(open/closed)로만 갈린다. ingestion은 지금처럼
-- update_source_title + propagate_source_title_to_changeset 트리거로 계속
-- 편집한다(그 경로가 이미 "open일 때만" 반영되므로 이 규칙과 안 부딪힌다).
-- relation(판정 대기)과 revert(재판정 초안)는 이 경로가 없었으므로(전에는
-- 편집 자체가 불가) 이 RPC가 새로 연다 — 대상 changeset이 status='open'이면
-- 타입 무관하게 title을 직접 덮어쓴다. -----
CREATE OR REPLACE FUNCTION update_changeset_title(p_changeset_id uuid, p_title text)
RETURNS void AS $$
DECLARE
  v_status changeset_status;
BEGIN
  SELECT status INTO v_status
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id
      USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'changeset % is closed — title is frozen', p_changeset_id
      USING ERRCODE = 'NM011';
  END IF;
  IF btrim(coalesce(p_title, '')) = '' THEN
    RAISE EXCEPTION 'title must not be empty';
  END IF;

  UPDATE changesets SET title = p_title WHERE id = p_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION update_changeset_title FROM public, anon;
GRANT EXECUTE ON FUNCTION update_changeset_title TO authenticated, service_role;

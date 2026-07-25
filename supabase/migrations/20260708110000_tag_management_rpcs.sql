-- =============================================================
-- Tag 라이프사이클 — 수동 생성·정의 수정·정리(archive)·복구(restore) RPC
-- (07-modeling.md §Tag, §동작규칙)
--
-- #355의 confirm_ingestion_review는 인테이크 확정 시 tag find-or-create만
-- 한다(기존 태그의 description은 절대 덮지 않는다 — 재사용 판단 기준이라). 그
-- 뒤 사람이 Tag를 목록으로 보거나 이름·정의를 직접 고치거나 접는 독립 경로가
-- 없었다.
--
-- Tag는 Changeset 대상이 아니다 — 판단·사실 콘텐츠가 아니라 찾기용 라벨이라
-- 잘못 바뀌어도 판단을 오염시키지 않으므로, 변경이력·불변성 없이 가볍게 직접
-- CRUD한다(soft delete만). 그래서 Reference 수동 RPC(#360)와 달리 changeset·
-- change를 남기지 않는다 — 계약(SECURITY DEFINER + 멤버십 검증)만 같다.
--
-- 직접 쓰기는 #348 RLS가 SELECT-only라 이미 막혀 있다 — 이 RPC들만 경유.
-- archive_reference와 같은 계약: 사용자 경로(authenticated, 멤버십 검증) +
-- 운영자(service_role), auth.uid() NULL이면 운영자 통과.
--
-- description은 재사용 판단 기준이라 update_tag가 이를 바꾸는 유일한 명시적
-- 경로다(인테이크 find-or-create는 절대 안 건드린다).
-- =============================================================

-- =============================================================
-- 1) create_tag — 새 Tag 생성
--
--   UNIQUE(workspace_id, title)은 archived 행도 포함하므로, 이미 접힌 제목과
--   같은 이름을 만들려 하면 막힌다 — 이 경우 새로 만드는 게 아니라 restore_tag로
--   되살려야 한다는 뜻이라 명확한 에러를 준다(원시 unique_violation 대신).
-- =============================================================

CREATE FUNCTION create_tag(
  p_workspace_id uuid,
  p_title        text,
  p_description  text
)
RETURNS uuid AS $$
DECLARE
  v_tag_id     uuid;
  v_constraint text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % is not accessible to the caller', p_workspace_id;
  END IF;

  INSERT INTO tags (workspace_id, title, description)
  VALUES (p_workspace_id, btrim(p_title), btrim(p_description))
  RETURNING id INTO v_tag_id;

  RETURN v_tag_id;
EXCEPTION WHEN unique_violation THEN
  -- 제목 중복만 사용자 메시지로 옮긴다 — 나중에 다른 unique 인덱스가 생겨도
  -- 무관한 위반을 "제목 중복"으로 오보하지 않게 제약 이름에 고정한다.
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'tags_workspace_id_title_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a tag titled "%" already exists in this workspace (restore it if archived)', btrim(p_title);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) update_tag — 이름·정의(description) 수정
--
--   active만 수정 대상(정리한 걸 고치는 건 취지에 어긋난다 — 먼저 restore).
--   title을 다른 태그와 겹치게 바꾸면 UNIQUE가 막고, create_tag와 같은 결의
--   명확한 에러를 준다. description은 여기서만 바뀐다(find-or-create는 안 건드림).
-- =============================================================

CREATE FUNCTION update_tag(
  p_tag_id      uuid,
  p_title       text,
  p_description text
)
RETURNS void AS $$
DECLARE
  v_constraint text;
BEGIN
  PERFORM 1 FROM tags
  WHERE id = p_tag_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tag % is not an active tag the caller can edit', p_tag_id;
  END IF;

  UPDATE tags
  SET title = btrim(p_title), description = btrim(p_description)
  WHERE id = p_tag_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'tags_workspace_id_title_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a tag titled "%" already exists in this workspace', btrim(p_title);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) archive_tag — 정리(soft delete)
--
--   status만 active→archived. digest_tags·reference_tags 링크는 건드리지 않는다
--   — 과거에 붙은 라벨은 그대로 유효하다(archive_reference가 인용을 남기는 것과
--   같은 결). 링크가 끊기는 건 hard delete(purge) 때 ON DELETE CASCADE뿐이다.
-- =============================================================

CREATE FUNCTION archive_tag(p_tag_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE tags SET status = 'archived'
  WHERE id = p_tag_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tag % is not an active tag the caller can archive', p_tag_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 4) restore_tag — 정리한 Tag 되살리기 (archive의 역연산)
--
--   status만 archived→active. UNIQUE는 (workspace_id, title)당 한 행만 허용하므로
--   되살릴 제목과 겹치는 active 태그가 있을 수 없다 — restore는 UNIQUE와 충돌하지
--   않는다(그 제목의 행은 이 archived 하나뿐).
-- =============================================================

CREATE FUNCTION restore_tag(p_tag_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE tags SET status = 'active'
  WHERE id = p_tag_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tag % is not an archived tag the caller can restore', p_tag_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION create_tag(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION create_tag(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION update_tag(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_tag(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION archive_tag(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_tag(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_tag(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_tag(uuid) TO authenticated, service_role;

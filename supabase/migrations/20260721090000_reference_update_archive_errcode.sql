-- =============================================================
-- update_reference·archive_reference 상태 가드에 NM007 부여
--
-- 20260707190000이 두 RPC를 만들 당시엔 tRPC 계층에 배선되지 않아(죽은 코드)
-- 에러 매핑이 문제되지 않았다. 이번에 Reference 상세(browsing-flow "Reference
-- 직접 수정"·"Reference 아카이브")가 이 RPC들을 실제로 호출하는 경로를 열면서,
-- "그 사이 다른 곳에서 이미 archive됨" 같은 정상적인 동시성 경합이 실제로
-- 발생할 수 있게 됐다. 두 RAISE EXCEPTION 모두 ERRCODE가 없어 기본 P0001로
-- 떨어지고, error-mapper가 이를 예상 밖 장애(query_failed)로 오분류해 매 경합마다
-- 스퓨리어스 Sentry 캡처 + 뭉뚱그린 에러 메시지를 낸다 — trash_reference가
-- 이미 쓰는 NM007(reference_state_changed, 20260714120000)과 같은 "그 사이
-- 상태가 바뀜" 결이라 같은 코드를 재사용한다(엔티티가 같으므로 코드도 같다 —
-- NM004/NM005/NM007/NM008이 엔티티별로 코드를 나누는 것과 반대로, 이건 같은
-- Reference 엔티티의 같은 상태 가드라 나눌 이유가 없다).
-- 시그니처는 불변이라 CREATE OR REPLACE로 본문만 교체 — 권한은 20260707190000의
-- GRANT가 그대로 유지된다.
-- =============================================================

CREATE OR REPLACE FUNCTION update_reference(
  p_reference_id  uuid,
  p_type          reference_type,
  p_title         text,
  p_body          text,
  p_external_urls text[]
)
RETURNS uuid AS $$
DECLARE
  v_cur          record;
  v_new_urls     text[];
  v_before       jsonb := '{}'::jsonb;
  v_after        jsonb := '{}'::jsonb;
  v_changeset_id uuid;
BEGIN
  v_new_urls := CASE
    WHEN p_external_urls IS NULL OR array_length(p_external_urls, 1) IS NULL THEN NULL
    ELSE p_external_urls
  END;

  SELECT r.workspace_id, r.type, r.title, r.body, r.external_urls
    INTO v_cur
  FROM "references" r
  WHERE r.id = p_reference_id AND r.status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(r.workspace_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can edit', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  IF v_cur.type IS DISTINCT FROM p_type THEN
    v_before := v_before || jsonb_build_object('type', v_cur.type);
    v_after  := v_after  || jsonb_build_object('type', p_type);
  END IF;
  IF v_cur.title IS DISTINCT FROM p_title THEN
    v_before := v_before || jsonb_build_object('title', v_cur.title);
    v_after  := v_after  || jsonb_build_object('title', p_title);
  END IF;
  IF v_cur.body IS DISTINCT FROM p_body THEN
    v_before := v_before || jsonb_build_object('body', v_cur.body);
    v_after  := v_after  || jsonb_build_object('body', p_body);
  END IF;
  IF v_cur.external_urls IS DISTINCT FROM v_new_urls THEN
    v_before := v_before || jsonb_build_object('external_urls', to_jsonb(v_cur.external_urls));
    v_after  := v_after  || jsonb_build_object('external_urls', to_jsonb(v_new_urls));
  END IF;

  IF v_before = '{}'::jsonb THEN
    RAISE EXCEPTION 'reference % unchanged — nothing to modify', p_reference_id;
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (NULL, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id, data)
  VALUES (
    v_changeset_id, 'modify', 'reference', p_reference_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  UPDATE "references"
  SET type = p_type, title = p_title, body = p_body, external_urls = v_new_urls
  WHERE id = p_reference_id;

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION archive_reference(p_reference_id uuid)
RETURNS uuid AS $$
DECLARE
  v_workspace_id uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE "references"
  SET status = 'archived'
  WHERE id = p_reference_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  RETURNING workspace_id INTO v_workspace_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can archive', p_reference_id
      USING ERRCODE = 'NM007';
  END IF;

  INSERT INTO changesets (space_id, type, status, author_id)
  VALUES (NULL, 'manual', 'applied', auth.uid())
  RETURNING id INTO v_changeset_id;

  INSERT INTO changes (changeset_id, action, target_type, target_id)
  VALUES (v_changeset_id, 'archive', 'reference', p_reference_id);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- reference_tags 조인 — Reference에 Tag 부여 (07-modeling.md §Reference, §Tag)
--
-- Reference는 Digest와 같은 Workspace 태그 풀(tags, #348)을 공유하되, 태그를
-- 인용한 Digest에서 파생시키지 않고 독립적으로 직접 부여한다 — Reference의
-- 태그는 "왜 계속 중요한가"를, Digest의 태그(digest_tags, #352/#355)는 "그 순간
-- 어떤 판단이었나"를 나타내는 별개 축이다.
--
-- 조인 멤버십은 Change로 남기지 않는다 — reference_links(무방향 상호 참조)가
-- Reference 본문 필드가 아니라 별도 테이블·별도 RPC로 다뤄지고 changeset에
-- 안 남는 것과 같은 결이다. Tag 자체가 애초에 Changeset 대상이 아니기도 하다
-- (07-modeling §동작규칙). purge 때는 references·tags ON DELETE CASCADE로 링크가
-- 자동 삭제돼 별도 그물이 필요 없다.
--
-- Tag 자체의 생성·수정·정리는 tag_management_rpcs가 담당한다 — 여기선 이미
-- 있는 태그를 Reference에 연결/해제만 한다(태그 생성 로직 중복 없음).
-- =============================================================

CREATE TABLE reference_tags (
  reference_id uuid NOT NULL REFERENCES "references"(id) ON DELETE CASCADE,
  tag_id       uuid NOT NULL REFERENCES tags(id)         ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reference_id, tag_id)
);
-- tag_id 역방향 조회 (정방향은 PK가 커버) — "이 태그가 붙은 Reference들"
CREATE INDEX idx_reference_tags_tag ON reference_tags (tag_id);

-- =============================================================
-- Workspace 경계 강제 — Reference·Tag 둘 다 Workspace 스코프라 경계를
-- 가로지르면 안 된다(digest_tags의 same-workspace 강제와 같은 결, Reference는
-- workspace_id를 직접 들고 있어 Space 조인이 불필요).
-- =============================================================

CREATE OR REPLACE FUNCTION enforce_reference_tag_same_workspace()
RETURNS trigger AS $$
DECLARE
  v_reference_workspace uuid;
  v_tag_workspace       uuid;
BEGIN
  SELECT workspace_id INTO v_reference_workspace FROM "references" WHERE id = NEW.reference_id;
  SELECT workspace_id INTO v_tag_workspace       FROM tags        WHERE id = NEW.tag_id;

  IF v_reference_workspace IS DISTINCT FROM v_tag_workspace THEN
    RAISE EXCEPTION 'reference_tags requires reference and tag in the same workspace (reference: %, tag: %)',
      v_reference_workspace, v_tag_workspace;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_reference_tags_same_workspace
  BEFORE INSERT OR UPDATE ON reference_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_reference_tag_same_workspace();

-- =============================================================
-- RLS — SELECT만 직접 허용, 쓰기는 RPC(SECURITY DEFINER) 경유
-- =============================================================

ALTER TABLE reference_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reference_tags_member_select" ON reference_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "references" r
      WHERE r.id = reference_id AND is_workspace_member(r.workspace_id)
    )
  );

-- =============================================================
-- link_reference_tag — Reference에 기존 Tag 연결
--
--   양쪽 존재·멤버십·active를 검사한다 — create_reference_link와 같은 계약.
--   active만 연결 대상: 정리(archive)한 Reference나 Tag에 새 링크를 거는 건
--   실수일 가능성이 높다. same-workspace는 트리거가 강제하지만, 여기서 멤버십을
--   함께 봐 접근 불가 대상에 명확한 에러를 준다. 재시도 멱등: ON CONFLICT DO NOTHING.
-- =============================================================

CREATE FUNCTION link_reference_tag(p_reference_id uuid, p_tag_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "references"
    WHERE id = p_reference_id AND status = 'active'
      AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  ) THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can tag', p_reference_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tags
    WHERE id = p_tag_id AND status = 'active'
      AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  ) THEN
    RAISE EXCEPTION 'tag % is not an active tag the caller can use', p_tag_id;
  END IF;

  INSERT INTO reference_tags (reference_id, tag_id)
  VALUES (p_reference_id, p_tag_id)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- unlink_reference_tag — Reference에서 Tag 떼기
--
--   idempotent DELETE(없으면 no-op). archived Reference에서 떼는 건 정리 취지라
--   막지 않는다(link의 active 가드와 달리) — 멤버십만 본다.
-- =============================================================

CREATE FUNCTION unlink_reference_tag(p_reference_id uuid, p_tag_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "references"
    WHERE id = p_reference_id
      AND (auth.uid() IS NULL OR is_workspace_member(workspace_id))
  ) THEN
    RAISE EXCEPTION 'reference % is not accessible to the caller', p_reference_id;
  END IF;

  DELETE FROM reference_tags
  WHERE reference_id = p_reference_id AND tag_id = p_tag_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION link_reference_tag(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION link_reference_tag(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION unlink_reference_tag(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION unlink_reference_tag(uuid, uuid) TO authenticated, service_role;

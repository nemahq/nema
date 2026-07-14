-- =============================================================
-- Topic 라이프사이클 — 이름 수정·정리(archive)·복구(restore) RPC
-- (browsing-flow.md "Topic 칩 클릭 → 편집 팝오버"/"Topic 이름 변경"/"Topic 아카이브"/
-- "Topic 아카이브 되살리기")
--
-- Tag(#404, tag_management_rpcs)와 같은 결: 판단·사실 콘텐츠가 아니라 찾기용
-- 라벨이라 변경이력·불변성 없이 가볍게 직접 CRUD한다(soft delete만). 계약도
-- 동일(SECURITY DEFINER + 멤버십 검증, 직접 쓰기는 #348류 RLS가 SELECT-only라
-- 막혀 있고 이 RPC들만 경유).
--
-- Tag와 다른 점: 1) 스코프가 Workspace가 아니라 Space다(topics.space_id) —
-- Topic은 Space를 가로지르지 않는 인테이크 산출물이라(content_intake_topics
-- 참고). 2) create가 없다 — Topic은 사람이 수동 생성하지 않고 인제스천 확정
-- (confirm_ingestion_review)의 find-or-create가 유일한 생성 경로다. 3) title
-- 옆에 재사용 판단 기준(description)이 없다 — 이름 하나만 고친다.
-- =============================================================

-- =============================================================
-- 0) topics.status — active/archived
-- =============================================================

CREATE TYPE topic_status AS ENUM ('active', 'archived');

ALTER TABLE topics ADD COLUMN status topic_status NOT NULL DEFAULT 'active';

-- =============================================================
-- 1) update_topic — 이름 수정
--
--   active만 수정 대상(정리한 걸 고치는 건 취지에 어긋난다 — 먼저 restore).
--   UNIQUE(space_id, name)은 archived 행도 포함하므로, 다른 활성 주제와 이름이
--   겹치면 명확한 에러를 준다(원시 unique_violation 대신).
-- =============================================================

CREATE FUNCTION update_topic(
  p_topic_id uuid,
  p_name     text
)
RETURNS void AS $$
DECLARE
  v_constraint text;
BEGIN
  PERFORM 1 FROM topics
  WHERE id = p_topic_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topic % is not an active topic the caller can edit', p_topic_id;
  END IF;

  UPDATE topics
  SET name = btrim(p_name)
  WHERE id = p_topic_id;
EXCEPTION WHEN unique_violation THEN
  GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
  IF v_constraint <> 'topics_space_id_name_key' THEN RAISE; END IF;
  RAISE EXCEPTION 'a topic named "%" already exists in this space', btrim(p_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) archive_topic — 정리(soft delete)
--
--   status만 active→archived. digest_topics·source_topics 링크는 건드리지
--   않는다 — 이미 붙은 Digest 연결은 그대로 유지되고(연쇄 해제 없음), 스레드
--   피드의 Topic 필터에서도 계속 선택 가능하다. 재사용 제안 후보에서만
--   빠진다(fetchRegistries가 status='active'만 조회).
-- =============================================================

CREATE FUNCTION archive_topic(p_topic_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE topics SET status = 'archived'
  WHERE id = p_topic_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topic % is not an active topic the caller can archive', p_topic_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) restore_topic — 정리한 Topic 되살리기 (archive의 역연산)
--
--   status만 archived→active. UNIQUE는 (space_id, name)당 한 행만 허용하므로
--   되살릴 이름과 겹치는 active 주제가 있을 수 없다 — restore는 UNIQUE와
--   충돌하지 않는다.
-- =============================================================

CREATE FUNCTION restore_topic(p_topic_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE topics SET status = 'active'
  WHERE id = p_topic_id AND status = 'archived'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'topic % is not an archived topic the caller can restore', p_topic_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role)
-- =============================================================

REVOKE ALL ON FUNCTION update_topic(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION update_topic(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION archive_topic(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION archive_topic(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_topic(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_topic(uuid) TO authenticated, service_role;

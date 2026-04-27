-- =============================================================
-- NEM-98: memory_revisions에 memory_name_snapshot 추가
-- Memory 삭제 후에도 Revision에서 기억 이름을 보존하기 위함.
-- =============================================================

-- ----- 1. memory_name_snapshot 컬럼 추가 (nullable로 시작) -----

ALTER TABLE memory_revisions ADD COLUMN memory_name_snapshot text;

-- ----- 2. 기존 rows backfill -----

UPDATE memory_revisions mr
SET memory_name_snapshot = m.title
FROM memories m
WHERE mr.memory_id = m.id;

-- ----- 3. NOT NULL 제약 추가 -----

ALTER TABLE memory_revisions ALTER COLUMN memory_name_snapshot SET NOT NULL;

-- ----- 4. memory_id FK: ON DELETE CASCADE → ON DELETE SET NULL -----

ALTER TABLE memory_revisions DROP CONSTRAINT memory_revisions_memory_id_fkey;

ALTER TABLE memory_revisions
  ADD CONSTRAINT memory_revisions_memory_id_fkey
  FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE SET NULL;

-- ----- 5. RLS 정책 업데이트 -----
-- memory_id IS NULL인 row(삭제된 기억의 revision)도 해당 history 소유자가 조회할 수 있어야 함.

DROP POLICY "memory_revisions_select" ON memory_revisions;

CREATE POLICY "memory_revisions_select" ON memory_revisions
  FOR SELECT USING (
    (memory_id IS NOT NULL AND memory_id IN (SELECT id FROM memories WHERE user_id = auth.uid()))
    OR
    (memory_id IS NULL AND history_id IN (SELECT id FROM histories WHERE user_id = auth.uid()))
  );

-- =============================================================
-- RPC 업데이트: _write_memory_revision 헬퍼에 memory_name_snapshot 추가
-- 파라미터 추가이므로 DROP 후 재생성.
-- =============================================================

DROP FUNCTION _write_memory_revision(uuid, uuid, uuid, text, text, text[], text, text, update_type, revision_source);

CREATE FUNCTION _write_memory_revision(
  p_memory_id             uuid,
  p_user_id               uuid,
  p_history_id            uuid,
  p_title                 text,
  p_category              text,
  p_tags                  text[],
  p_summary               text,
  p_body                  text,
  p_update_type           update_type,
  p_source                revision_source,
  p_memory_name_snapshot  text
)
RETURNS void AS $$
DECLARE
  v_prev_body text;
BEGIN
  SELECT body INTO v_prev_body
  FROM memories
  WHERE id = p_memory_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory % not found for user %', p_memory_id, p_user_id;
  END IF;

  UPDATE memories
  SET title                  = p_title,
      category               = p_category,
      tags                   = p_tags,
      summary                = p_summary,
      body                   = p_body,
      ingestion_status       = 'pending',
      ingestion_retry_count  = 0,
      last_ingestion_attempt = NULL
  WHERE id = p_memory_id;

  INSERT INTO memory_revisions (memory_id, history_id, prev_body, next_body, update_type, source, memory_name_snapshot)
  VALUES (p_memory_id, p_history_id, v_prev_body, p_body, p_update_type, p_source, p_memory_name_snapshot);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION _write_memory_revision FROM public, anon, authenticated;

-- =============================================================
-- create_memory_with_revision: memory_name_snapshot 추가
-- =============================================================

CREATE OR REPLACE FUNCTION create_memory_with_revision(
  p_user_id    uuid,
  p_history_id uuid,
  p_title      text,
  p_category   text,
  p_tags       text[],
  p_summary    text,
  p_body       text
)
RETURNS uuid AS $$
DECLARE
  v_memory_id uuid;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM histories WHERE id = p_history_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'history not found or not owned by user';
  END IF;

  INSERT INTO memories (user_id, title, category, tags, summary, body, ingestion_status)
  VALUES (p_user_id, p_title, p_category, p_tags, p_summary, p_body, 'pending')
  RETURNING id INTO v_memory_id;

  INSERT INTO memory_revisions (memory_id, history_id, prev_body, next_body, update_type, source, memory_name_snapshot)
  VALUES (v_memory_id, p_history_id, NULL, p_body, 'create', 'direct', p_title);

  PERFORM pgmq.send('memory_sync', jsonb_build_object('type', 'notify'));

  RETURN v_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- update_memory_with_revision: 헬퍼에 p_title 전달
-- =============================================================

CREATE OR REPLACE FUNCTION update_memory_with_revision(
  p_memory_id   uuid,
  p_user_id     uuid,
  p_history_id  uuid,
  p_title       text,
  p_category    text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_update_type update_type
)
RETURNS void AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM histories WHERE id = p_history_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'history not found or not owned by user';
  END IF;

  PERFORM _write_memory_revision(
    p_memory_id, p_user_id, p_history_id,
    p_title, p_category, p_tags, p_summary, p_body,
    p_update_type, 'direct'::revision_source,
    p_title
  );

  PERFORM pgmq.send('memory_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- apply_propagated_revision: 헬퍼에 p_title 전달
-- =============================================================

CREATE OR REPLACE FUNCTION apply_propagated_revision(
  p_memory_id   uuid,
  p_user_id     uuid,
  p_history_id  uuid,
  p_title       text,
  p_category    text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_update_type update_type
)
RETURNS void AS $$
BEGIN
  PERFORM _write_memory_revision(
    p_memory_id, p_user_id, p_history_id,
    p_title, p_category, p_tags, p_summary, p_body,
    p_update_type, 'propagated'::revision_source,
    p_title
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION apply_propagated_revision FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_propagated_revision TO service_role;

-- =============================================================
-- Migration: memories, histories, memory_revisions 테이블 생성
-- =============================================================

-- ----- Enum types -----
CREATE TYPE update_type AS ENUM ('create', 'extend', 'replace');
CREATE TYPE revision_source AS ENUM ('direct', 'regeneration');

-- ----- memories -----
CREATE TABLE memories (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                  text,
  category               text,
  tags                   text[] DEFAULT '{}',
  summary                text,
  body                   text NOT NULL,
  ingestion_status       ingestion_status NOT NULL DEFAULT 'pending',
  ingestion_retry_count  int NOT NULL DEFAULT 0,
  last_ingestion_attempt timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- ----- histories -----
CREATE TABLE histories (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  source_draft_body text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ----- memory_revisions -----
CREATE TABLE memory_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id   uuid NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  history_id  uuid NOT NULL REFERENCES histories(id) ON DELETE CASCADE,
  prev_body   text,
  next_body   text NOT NULL,
  update_type update_type NOT NULL,
  source      revision_source NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ----- save_jobs: history_id 추가 -----
ALTER TABLE save_jobs ADD COLUMN history_id uuid REFERENCES histories(id) ON DELETE SET NULL;

-- =============================================================
-- Indexes
-- =============================================================

CREATE INDEX idx_memories_user_created    ON memories (user_id, created_at DESC);
CREATE INDEX idx_memories_pending         ON memories (id) WHERE ingestion_status = 'pending';
CREATE INDEX idx_memories_tags            ON memories USING gin (tags);
CREATE INDEX idx_histories_user_created   ON histories (user_id, created_at DESC);
CREATE INDEX idx_histories_session        ON histories (source_session_id) WHERE source_session_id IS NOT NULL;
CREATE INDEX idx_memory_revisions_memory  ON memory_revisions (memory_id, created_at DESC);
CREATE INDEX idx_memory_revisions_history ON memory_revisions (history_id);
CREATE INDEX idx_save_jobs_history        ON save_jobs (history_id) WHERE history_id IS NOT NULL;

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE memories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE histories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "memories_owner" ON memories
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

CREATE POLICY "histories_owner" ON histories
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK  (user_id = auth.uid());

CREATE POLICY "memory_revisions_owner" ON memory_revisions
  FOR ALL USING (
    memory_id IN (SELECT id FROM memories WHERE user_id = auth.uid())
  )
  WITH CHECK (
    memory_id IN (SELECT id FROM memories WHERE user_id = auth.uid())
  );

-- =============================================================
-- Triggers
-- =============================================================

CREATE TRIGGER trg_memories_updated_at
  BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- PGMQ: memory_sync 큐
-- =============================================================

SELECT pgmq.create('memory_sync');

-- =============================================================
-- RPC: Phase 2 (authenticated)
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

  INSERT INTO memories (user_id, title, category, tags, summary, body, ingestion_status)
  VALUES (p_user_id, p_title, p_category, p_tags, p_summary, p_body, 'pending')
  RETURNING id INTO v_memory_id;

  INSERT INTO memory_revisions (memory_id, history_id, prev_body, next_body, update_type, source)
  VALUES (v_memory_id, p_history_id, NULL, p_body, 'create', 'direct');

  PERFORM pgmq.send('memory_sync', jsonb_build_object('type', 'notify'));

  RETURN v_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

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
DECLARE
  v_prev_body text;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  SELECT body INTO v_prev_body
  FROM memories
  WHERE id = p_memory_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'memory not found or not owned by user';
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

  INSERT INTO memory_revisions (memory_id, history_id, prev_body, next_body, update_type, source)
  VALUES (p_memory_id, p_history_id, v_prev_body, p_body, p_update_type, 'direct');

  PERFORM pgmq.send('memory_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- RPC: Phase 3 (service_role)
-- =============================================================

CREATE OR REPLACE FUNCTION fetch_pending_memories(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (id uuid, user_id uuid, body text, tags text[], summary text, created_at timestamptz) AS $$
BEGIN
  RETURN QUERY
  SELECT m.id, m.user_id, m.body, m.tags, m.summary, m.created_at
  FROM memories m
  WHERE m.ingestion_status = 'pending'
    AND m.ingestion_retry_count < p_max_retries
    AND (m.last_ingestion_attempt IS NULL
         OR m.last_ingestion_attempt + m.ingestion_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION complete_memory_ingestion(p_memory_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE memories SET ingestion_status = 'completed' WHERE id = p_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION increment_memory_ingestion_retry(
  p_memory_id   uuid,
  p_max_retries int DEFAULT 5
)
RETURNS void AS $$
BEGIN
  UPDATE memories
  SET ingestion_retry_count  = ingestion_retry_count + 1,
      last_ingestion_attempt = now(),
      ingestion_status = CASE
        WHEN ingestion_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_memory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Phase 4 엔티티 orphan prune 배치용
CREATE OR REPLACE FUNCTION list_memory_user_ids()
RETURNS TABLE (user_id uuid) AS $$
  SELECT DISTINCT m.user_id FROM memories m;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================
-- RPC: PGMQ (service_role) — memory_sync으로 전환
-- =============================================================

DROP FUNCTION IF EXISTS read_sync_events(int, int);
DROP FUNCTION IF EXISTS ack_sync_event(bigint);

CREATE OR REPLACE FUNCTION read_sync_events(
  p_batch_size         int DEFAULT 5,
  p_visibility_timeout int DEFAULT 30
)
RETURNS TABLE (msg_id bigint, read_ct int, message jsonb) AS $$
BEGIN
  RETURN QUERY
  SELECT r.msg_id, r.read_ct, r.message
  FROM pgmq.read('memory_sync', p_visibility_timeout, p_batch_size) r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE OR REPLACE FUNCTION ack_sync_event(p_msg_id bigint)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.archive('memory_sync', p_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- RPC: get_unique_tags — memories로 전환
-- =============================================================

CREATE OR REPLACE FUNCTION get_unique_tags(p_user_id uuid)
RETURNS text[] AS $$
  SELECT coalesce(array_agg(DISTINCT t) FILTER (WHERE t IS NOT NULL), '{}')
  FROM memories, unnest(tags) AS t
  WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION get_unique_tags(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_unique_tags(uuid) TO authenticated;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION create_memory_with_revision FROM public, anon;
GRANT EXECUTE ON FUNCTION create_memory_with_revision TO authenticated;

REVOKE ALL ON FUNCTION update_memory_with_revision FROM public, anon;
GRANT EXECUTE ON FUNCTION update_memory_with_revision TO authenticated;

REVOKE ALL ON FUNCTION fetch_pending_memories FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_memories TO service_role;

REVOKE ALL ON FUNCTION complete_memory_ingestion FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION complete_memory_ingestion TO service_role;

REVOKE ALL ON FUNCTION increment_memory_ingestion_retry FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_memory_ingestion_retry TO service_role;

REVOKE ALL ON FUNCTION list_memory_user_ids() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION list_memory_user_ids() TO service_role;

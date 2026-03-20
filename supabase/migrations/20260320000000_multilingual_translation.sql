-- =============================================================
-- Migration: multilingual translation support
-- profiles table + documents _en columns
-- =============================================================

-- ----- profiles (1:1 with auth.users) -----
CREATE TABLE profiles (
  user_id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content_language  text NOT NULL DEFAULT 'en',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_owner" ON profiles
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----- documents: add _en columns (nullable = original is English) -----
ALTER TABLE documents ADD COLUMN body_en    text;
ALTER TABLE documents ADD COLUMN title_en   text;
ALTER TABLE documents ADD COLUMN tags_en    text[];
ALTER TABLE documents ADD COLUMN summary_en text;

-- ----- Clear pre-multilingual data -----
TRUNCATE documents CASCADE;
TRUNCATE save_jobs;

-- =============================================================
-- RPC: create_document_with_event (add _en params)
-- =============================================================

DROP FUNCTION IF EXISTS create_document_with_event(uuid, text, text[], text, text, uuid);

CREATE OR REPLACE FUNCTION create_document_with_event(
  p_user_id     uuid,
  p_title       text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_session_id  uuid,
  p_title_en    text   DEFAULT NULL,
  p_tags_en     text[] DEFAULT NULL,
  p_summary_en  text   DEFAULT NULL,
  p_body_en     text   DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_doc_id uuid;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  INSERT INTO documents (
    user_id, title, tags, summary, body,
    title_en, tags_en, summary_en, body_en,
    ingestion_status
  )
  VALUES (
    p_user_id, p_title, p_tags, p_summary, p_body,
    p_title_en, p_tags_en, p_summary_en, p_body_en,
    'pending'
  )
  RETURNING id INTO v_doc_id;

  INSERT INTO session_documents (session_id, document_id)
  VALUES (p_session_id, v_doc_id)
  ON CONFLICT DO NOTHING;

  PERFORM pgmq.send('document_sync', jsonb_build_object('type', 'notify'));

  RETURN v_doc_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- RPC: update_document_with_event (add _en params)
-- =============================================================

DROP FUNCTION IF EXISTS update_document_with_event(uuid, uuid, text, text[], text, text);

CREATE OR REPLACE FUNCTION update_document_with_event(
  p_doc_id      uuid,
  p_user_id     uuid,
  p_title       text,
  p_tags        text[],
  p_summary     text,
  p_body        text,
  p_title_en    text   DEFAULT NULL,
  p_tags_en     text[] DEFAULT NULL,
  p_summary_en  text   DEFAULT NULL,
  p_body_en     text   DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  UPDATE documents
  SET title                  = p_title,
      tags                   = p_tags,
      summary                = p_summary,
      body                   = p_body,
      title_en               = p_title_en,
      tags_en                = p_tags_en,
      summary_en             = p_summary_en,
      body_en                = p_body_en,
      ingestion_status       = 'pending',
      ingestion_retry_count  = 0,
      last_ingestion_attempt = NULL
  WHERE id = p_doc_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document not found or not owned by user';
  END IF;

  PERFORM pgmq.send('document_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- RPC: fetch_pending_documents (add body_en to return)
-- =============================================================

DROP FUNCTION IF EXISTS fetch_pending_documents(int);

CREATE OR REPLACE FUNCTION fetch_pending_documents(
  p_max_retries int DEFAULT 5
)
RETURNS TABLE (id uuid, user_id uuid, body text, body_en text, tags text[], tags_en text[], summary text, summary_en text) AS $$
BEGIN
  RETURN QUERY
  SELECT d.id, d.user_id, d.body, d.body_en, d.tags, d.tags_en, d.summary, d.summary_en
  FROM documents d
  WHERE d.ingestion_status = 'pending'
    AND d.ingestion_retry_count < p_max_retries
    AND (d.last_ingestion_attempt IS NULL
         OR d.last_ingestion_attempt + d.ingestion_retry_count * interval '30 seconds' < now())
  LIMIT 10;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION create_document_with_event FROM public, anon;
GRANT EXECUTE ON FUNCTION create_document_with_event TO authenticated;

REVOKE ALL ON FUNCTION update_document_with_event FROM public, anon;
GRANT EXECUTE ON FUNCTION update_document_with_event TO authenticated;

REVOKE ALL ON FUNCTION fetch_pending_documents FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION fetch_pending_documents TO service_role;

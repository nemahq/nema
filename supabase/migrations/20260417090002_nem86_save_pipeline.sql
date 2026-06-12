-- =============================================================
-- NEM-86: save pipeline 지원 스키마 변경
-- 1. revision_source enum: 'regeneration' → 'propagated'
-- 2. save_jobs.draft_body nullable (처리 완료 후 null 초기화)
-- 3. link_draft_to_history RPC 추가
-- =============================================================

-- ----- 1. revision_source enum 교체 -----

ALTER TYPE revision_source RENAME TO revision_source_old;
CREATE TYPE revision_source AS ENUM ('direct', 'propagated');

ALTER TABLE memory_revisions
  ALTER COLUMN source TYPE revision_source
  USING source::text::revision_source;

DROP TYPE revision_source_old;

-- ----- 2. save_jobs.draft_body nullable -----

ALTER TABLE save_jobs ALTER COLUMN draft_body DROP NOT NULL;

-- ----- 3. link_draft_to_history -----
-- 세션의 가장 최근 unlinked draft 메시지에 historyId를 태깅한다.

CREATE OR REPLACE FUNCTION link_draft_to_history(
  p_session_id uuid,
  p_history_id uuid
)
RETURNS void AS $$
DECLARE
  v_target_id text;
BEGIN
  SELECT elem->>'id'
  INTO v_target_id
  FROM sessions,
       jsonb_array_elements(COALESCE(messages, '[]'::jsonb))
         WITH ORDINALITY AS t(elem, idx)
  WHERE sessions.id = p_session_id
    AND elem->>'type' = 'draft'
    AND elem->>'historyId' IS NULL
  ORDER BY idx DESC
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE sessions
  SET messages = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'id' = v_target_id
        THEN elem || jsonb_build_object('historyId', p_history_id::text)
        ELSE elem
      END
      ORDER BY idx
    )
    FROM jsonb_array_elements(COALESCE(messages, '[]'::jsonb))
      WITH ORDINALITY AS t(elem, idx)
  )
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION link_draft_to_history(uuid, uuid) TO authenticated;

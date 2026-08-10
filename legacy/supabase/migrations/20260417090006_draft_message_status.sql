-- Draft 메시지에 status 필드 명시화: unlinked/linked variant 분리.
-- linked variant에서는 historyId가 항상 존재한다는 타입 보장을 런타임 데이터와 정합시킨다.

-- ----- 1. 기존 draft 메시지 backfill -----
-- historyId 있는 것 → status: 'linked', 없는 것 → status: 'unlinked'

UPDATE sessions
SET messages = (
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'type' = 'draft' AND elem->>'status' IS NULL THEN
        elem || CASE
          WHEN elem ? 'historyId'
            THEN jsonb_build_object('status', 'linked')
          ELSE jsonb_build_object('status', 'unlinked')
        END
      ELSE elem
    END
    ORDER BY idx
  )
  FROM jsonb_array_elements(COALESCE(messages, '[]'::jsonb))
    WITH ORDINALITY AS t(elem, idx)
)
WHERE messages IS NOT NULL
  AND messages @> '[{"type": "draft"}]'::jsonb;

-- ----- 2. link_draft_to_history: historyId + status='linked'을 함께 부여 -----

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
    AND elem->>'status' = 'unlinked'
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
        THEN elem || jsonb_build_object(
          'historyId', p_history_id::text,
          'status', 'linked'
        )
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

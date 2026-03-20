DROP FUNCTION IF EXISTS append_message(uuid, jsonb);

CREATE FUNCTION append_message(p_session_id uuid, p_message jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_message_id text := p_message->>'id';
BEGIN
  UPDATE sessions
  SET messages = COALESCE(messages, '[]'::jsonb) || jsonb_build_array(p_message)
  WHERE id = p_session_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(messages, '[]'::jsonb)) AS m
      WHERE m->>'id' = v_message_id
    );

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM sessions WHERE id = p_session_id) THEN
      RAISE EXCEPTION 'session_not_found'
        USING ERRCODE = 'P0002';
    END IF;
    -- Session exists but message ID already present — idempotent no-op
  END IF;
END;
$$;

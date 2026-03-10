CREATE OR REPLACE FUNCTION append_message(p_session_id uuid, p_message jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE sessions
  SET messages = COALESCE(messages, '[]'::jsonb) || jsonb_build_array(p_message)
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

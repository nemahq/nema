CREATE FUNCTION update_message_payload(
  p_session_id uuid,
  p_message_id text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE sessions
  SET messages = (
    SELECT jsonb_agg(
      CASE
        WHEN elem->>'id' = p_message_id
        THEN jsonb_set(elem, '{payload}', p_payload)
        ELSE elem
      END
      ORDER BY idx
    )
    FROM jsonb_array_elements(COALESCE(messages, '[]'::jsonb))
      WITH ORDINALITY AS t(elem, idx)
  )
  WHERE id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found'
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

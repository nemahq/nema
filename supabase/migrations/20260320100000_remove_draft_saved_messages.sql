-- Remove draft_saved status messages from all sessions.
-- These are no longer generated; the floating Save Queue widget handles feedback instead.
UPDATE sessions
SET messages = (
  SELECT jsonb_agg(msg ORDER BY msg->>'createdAt')
  FROM jsonb_array_elements(messages) AS msg
  WHERE NOT (msg->>'type' = 'status' AND msg->>'content' = 'draft_saved')
)
WHERE messages @> '[{"type": "status", "content": "draft_saved"}]';

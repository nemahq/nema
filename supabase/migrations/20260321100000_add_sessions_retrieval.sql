ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS retrieval jsonb
  CHECK (retrieval IS NULL OR jsonb_typeof(retrieval) = 'object');

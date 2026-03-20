ALTER TABLE sessions
  ADD COLUMN retrieval jsonb
  CHECK (retrieval IS NULL OR jsonb_typeof(retrieval) = 'object');

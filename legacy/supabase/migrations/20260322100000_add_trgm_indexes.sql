-- pg_trgm extension for efficient ILIKE queries on title/summary columns
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_documents_title_en_trgm
  ON documents USING gin (title_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_summary_en_trgm
  ON documents USING gin (summary_en gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON documents USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_summary_trgm
  ON documents USING gin (summary gin_trgm_ops);

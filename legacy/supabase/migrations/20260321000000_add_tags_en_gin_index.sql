CREATE INDEX idx_documents_tags_en ON documents USING gin (tags_en);

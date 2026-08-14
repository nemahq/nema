-- =============================================================
-- 초안 목록(v_draft_sources)에 public_id를 실어보낸다.
--
-- source.list(listDraftSources)가 원문 상세 링크(?source=<public_id>)를 만들려면
-- public_id가 필요하다 — 뷰 컬럼 목록에 없으면 select 대상 자체가 안 된다.
-- CREATE OR REPLACE VIEW은 기존 컬럼 순서를 못 바꾼다 — 새 컬럼은 끝에 붙인다
-- (add_source_body_preview와 같은 관례).
-- =============================================================

CREATE OR REPLACE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status, s.body_preview, s.public_id
FROM sources s
WHERE s.digestion_status = 'pending'
   OR NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = s.id);

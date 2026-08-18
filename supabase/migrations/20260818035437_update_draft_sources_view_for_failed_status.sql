-- =============================================================
-- v_draft_sources — processing(처리 중)은 이제 초안 탭에서 뺀다.
--
-- 화면엔 "정리 중" 표시가 없다 — 처리 중을 아예 노출하지 않는 쪽으로 간다.
-- failed만 "확인 필요"로 남기고, completed인데 digest가 0개인 경우(결과없음)는
-- 그대로 둔다.
--
-- "NOT EXISTS(digests)"만으로는 안 된다 — 막 던져 아직 digest가 하나도 안
-- 생긴 processing 원문도 이 조건 하나로 걸려버린다(digestion_status를 안
-- 본다). completed 쪽에만 "digest 0개"를 조건으로 걸어야 processing이 확실히
-- 빠진다.
-- =============================================================

CREATE OR REPLACE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status, s.body_preview, s.public_id
FROM sources s
WHERE s.trashed_at IS NULL
  AND (s.digestion_status = 'failed'
       OR (s.digestion_status = 'completed'
           AND NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = s.id)));

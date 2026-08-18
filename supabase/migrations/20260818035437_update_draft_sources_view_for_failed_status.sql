-- =============================================================
-- 백필 — 이전 마이그레이션의 RENAME VALUE는 prod의 기존 pending 행을 전부
-- processing으로 만든다. 그런데 이번 마이그레이션이 v_draft_sources에서
-- processing을 빼버리므로, 그대로 두면 이전 세대에 LLM 실패로 pending에 굳어
-- 있던 원문들이 초안 탭·다이제스트 목록 어디에도 안 뜨고 삭제·재추출 진입점도
-- 사라진다.
--
-- 이 UPDATE는 배포 시점에 딱 한 번, 이 마이그레이션과 함께 실행된다 — 그
-- 시점에 processing이면서 digest가 하나도 없는 행은 전부 "이전 세대에서 끝까지
-- 못 간(=진짜 실패한)" 행이다. 배포 파이프라인은 마이그레이션 적용 중엔 새
-- 요청을 받지 않으므로, 이 순간 진짜로 처리 중인 행이 섞여 들어와 잘못
-- failed로 바뀔 위험은 없다. digest가 있는 processing 행(마지막 상태 UPDATE만
-- 실패한 극히 드문 유령 상태)은 그대로 둔다 — 이건 데이터가 이미 유효해서
-- failed로 덮어쓰면 안 된다(source-service.ts의 SourceCompletionUpdateFailedError
-- 처리와 같은 원칙).
UPDATE sources
SET digestion_status = 'failed'
WHERE digestion_status = 'processing'
  AND NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = sources.id);

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

COMMENT ON VIEW v_draft_sources IS
  '초안 화면(다이제스트가 없거나 실패한 원문) 전용 조회. failed는 처리 도중
   실패해 끝난 원문이고, completed인데 digests 행이 0인 건 완료는 됐지만 정리
   결과가 하나도 안 나온 경우다 — 둘 다 초안으로 묶는다. processing(처리 중)은
   일부러 뺀다 — 화면에 "처리 중" 표시가 없어서, processing을 보여주면 정상
   진행 중인 원문이 실패로 오인된다(fix/draft-error-state).';

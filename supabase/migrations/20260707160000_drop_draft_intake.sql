-- =============================================================
-- Track 0 초안(draft) 인테이크 제거 — 새 Digest 파이프라인이 대체
--
-- v2 흐름은 원본을 곧바로 pending으로 박제하고(create_source), 워커가 Digest
-- 후보를 생성해 리뷰 게이트에 세운다. Source 앞단의 draft 스테이징 층은 더 이상
-- 자리가 없다(07-modeling: 날글은 Source로 박제, 정리본은 Digest가 맡음).
-- draft가 하던 topic 연결은 confirm_ingestion_review가 이미 수행한다.
--
-- drafts 테이블은 참조하는 FK가 없어 self-contained drop이다. draft_origin enum도
-- drafts 전용이라 함께 제거한다. (세션 채팅 draft는 별개 층이라 건드리지 않는다.)
-- =============================================================

DROP FUNCTION IF EXISTS confirm_draft(uuid, text, text[]);
DROP FUNCTION IF EXISTS delete_draft(uuid);
DROP FUNCTION IF EXISTS update_draft(uuid, text, text, text[]);
DROP FUNCTION IF EXISTS create_draft(uuid, draft_origin, text, text, text[]);

DROP TABLE IF EXISTS drafts;

DROP TYPE IF EXISTS draft_origin;

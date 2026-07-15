-- =============================================================
-- Realtime — sources·changesets를 supabase_realtime publication에 추가
-- 초안 탭(초안 정리 완료)·Space/변경사항 배지(Changeset 생성·확정·폐기)를
-- 폴링 대신 Postgres CDC로 실시간 갱신한다. payload는 "뭔가 바뀌었다" 신호로만
-- 쓰고 클라이언트가 해당 쿼리를 invalidate → 검증된 기존 조회 로직(RLS 필터 포함)을
-- 그대로 재사용한다.
--
-- RLS가 이미 두 테이블에 걸려 있어(member SELECT 정책) Realtime 브로드캐스트도
-- 구독자가 볼 수 있는 Space 범위로만 스코프된다. 구독은 INSERT/UPDATE만 쓰고
-- 새 row의 space_id로 RLS를 판정하므로 구 row가 필요한 REPLICA IDENTITY FULL은
-- 불필요 — 기본(PK)으로 충분하다.
-- =============================================================

-- supabase_realtime publication은 Supabase가 기본 생성하지만, 로컬 등 없을 수 있는
-- 환경을 대비해 없으면 만든다(ADD TABLE이 참조할 대상 보장).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE sources;
ALTER PUBLICATION supabase_realtime ADD TABLE changesets;

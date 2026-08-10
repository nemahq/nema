-- public 스키마 기준선.
--
-- Supabase 클라우드가 프로젝트를 프로비저닝할 때 적용하는 public 스키마 기본 권한
-- (service_role에 CREATE, anon/authenticated/service_role에 default privileges)이
-- 로컬 shadow DB 이미지에는 없다. PR #564에서 이전 세대 마이그레이션 141개를 legacy/로
-- 옮기며 supabase/migrations가 비워지기 전까지는 그 141개 중 무언가가 우연히 이 권한을
-- 재설정해 shadow와 클라우드가 같아 보였을 뿐이다. 마이그레이션이 0개가 되자 원래부터
-- 있던 차이가 deploy-staging의 드리프트 검사에서 드러났다.
--
-- 이 파일은 그 차이를 메우는 새 스키마의 0번 마이그레이션이다. 도메인 테이블·RLS·함수·enum은
-- 여기 들어오지 않는다 — 그건 다음 슬라이스의 몫이다.
COMMENT ON SCHEMA public IS NULL;
ALTER SCHEMA public OWNER TO postgres;
REVOKE USAGE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM pg_database_owner;
GRANT CREATE ON SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

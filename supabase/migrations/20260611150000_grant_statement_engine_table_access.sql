-- 진술 엔진 표의 역할 권한을 명시적으로 박는다.
--
-- 배경: 환경(CLI 버전·호스티드)에 따라 default privileges가 달라
-- 새 표에 anon/authenticated/service_role의 DML·SELECT가 자동 부여되지
-- 않을 수 있다(최신 로컬 CLI에서 실측 — RLS 이전에 표 권한에서 거부됨).
-- 스키마 설계(5.1)의 "직접 SELECT + RLS, 쓰기는 RPC만"이 환경 기본값에
-- 의존하지 않도록 여기서 고정한다.
--
-- - authenticated: SELECT만 (쓰기는 SECURITY DEFINER RPC 경유라 불필요)
-- - service_role: 전체 DML (워커는 RPC를 쓰지만 운영 도구·시드의 직접 접근 대비)
-- - anon: 없음

GRANT SELECT ON
  public.spaces,
  public.space_members,
  public.sources,
  public.statements,
  public.statement_sources,
  public.changesets,
  public.changes,
  public.statement_relations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.spaces,
  public.space_members,
  public.sources,
  public.statements,
  public.statement_sources,
  public.changesets,
  public.changes,
  public.statement_relations
TO service_role;

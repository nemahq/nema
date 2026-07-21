-- =============================================================
-- references·reference_tags·reference_links 표 권한 명시적 부여
--
-- 20260611150000과 같은 이유: 이 프로젝트에서 마이그레이션을 실행하는
-- postgres 롤의 default privileges는 새 표에 anon/authenticated/
-- service_role의 SELECT·DML을 자동으로 얹지 않는다(realtime 로컬 검증으로
-- 실측 — pg_default_acl에 anon/authenticated/service_role이 TRUNCATE·
-- REFERENCES·TRIGGER만 갖고 SELECT는 없음). references(20260706105655)·
-- reference_tags(20260708120000) 생성 당시엔 이 표 권한을 명시적으로
-- 얹지 않아, RLS 정책(references_member_select 등)이 있어도 그 앞단
-- 표 권한에서 이미 막힌다 — reference.get·reference.list(직접 select
-- 경로)가 실제 배포 환경에서 permission denied로 전부 막히는 상태였다.
-- update_reference·archive_reference·link_reference_tag 등 RPC 경유
-- 쓰기는 SECURITY DEFINER라 이 표 권한과 무관하게 이미 동작한다 — 이번에
-- 막힌 건 순수 select 경로뿐이었다. tags도 함께 얹는다 — reference.get이
-- reference_tags(tags(id, title))를 임베드해 조회하므로 PostgREST가 tags
-- 표 권한까지 요구한다(PostgREST 임베드는 조인 대상 표에도 grantee의 SELECT가
-- 있어야 한다 — RLS와 별개의 앞단 체크).
--
-- topics·digests·workspace_members 등 다른 표에도 같은 갭이 있는 것으로
-- 로컬에서 함께 확인됐으나, 이번 슬라이스가 실제로 건드리는 표(references
-- 계열 + tags)만 범위로 좁힌다 — 나머지는 각자의 슬라이스가 만들 때 같은
-- 패턴으로 채우거나, 프로젝트 전역 default privileges를 한 번에 고치는
-- 별도 인프라 작업으로 다뤄야 한다.
-- =============================================================

GRANT SELECT ON public."references", public.reference_tags, public.reference_links, public.tags
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public."references", public.reference_tags, public.reference_links, public.tags
  TO service_role;

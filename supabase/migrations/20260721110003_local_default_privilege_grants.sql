-- =============================================================
-- 나머지 표들의 권한 명시적 부여 (20260721091000의 후속)
--
-- 20260721091000과 같은 이유: 이 프로젝트에서 마이그레이션을 실행하는 postgres
-- 롤의 default privileges는 새 표에 anon/authenticated/service_role의
-- SELECT·DML을 자동으로 얹지 않는다. 그 마이그레이션은 자기 슬라이스가 실제로
-- 건드리는 표(references 계열 + tags)만 좁혀 고쳤고, "topics·digests·
-- workspace_members 등 다른 표에도 같은 갭이 있다"를 로컬에서 확인해 후속
-- 슬라이스나 "프로젝트 전역 default privileges를 한 번에 고치는 별도 인프라
-- 작업"으로 남겨뒀다 — 이번이 그 인프라 작업이다.
--
-- 실제 배포 환경(스테이징) 확인: 이 표들은 스테이징에 이미 organic하게(마이그레이션
-- 파일 밖에서, 아마 대시보드 SQL Editor로 시점 불명) SELECT grant가 걸려 있어
-- 실사용자에게는 영향이 없었다 — 로컬 db reset(마이그레이션만으로 처음부터
-- 재생성)에서만 재현되는 로컬 전용 격차다. 다만 앞으로 실제 로그인 유저로
-- 로컬 검증(archive_digest/restore_digest 등 이번 슬라이스가 그렇게 검증함)을
-- 하려는 다음 사람이 같은 혼란을 겪지 않도록 여기서 마이그레이션으로 고정해둔다.
--
-- 대상 선정: 로컬에서 SELECT grant가 없는 걸 실측한 표 전부(pg_class 순회 +
-- has_table_privilege 확인) 가운데, references 계열(20260721091000이 이미 처리)만
-- 제외. eval_runs 등도 포함 — RLS는 이 표들 전부 이미 켜져 있어(rls_enabled 확인함)
-- 표 권한만 열어도 실제로 보이는 행은 RLS 정책이 그대로 좁힌다.
-- =============================================================

GRANT SELECT ON
  public.digests, public.digest_topics, public.digest_tags,
  public.digest_references, public.digest_links, public.statement_references,
  public.source_topics, public.topics, public.workspaces,
  public.workspace_members, public.profiles, public.sessions,
  public.session_retrievals, public.source_digestion_state, public.events,
  public.eval_runs
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.digests, public.digest_topics, public.digest_tags,
  public.digest_references, public.digest_links, public.statement_references,
  public.source_topics, public.topics, public.workspaces,
  public.workspace_members, public.profiles, public.sessions,
  public.session_retrievals, public.source_digestion_state, public.events,
  public.eval_runs
  TO service_role;

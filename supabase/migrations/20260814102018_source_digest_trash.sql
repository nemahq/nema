-- =============================================================
-- 휴지통 슬라이스: 삭제 정책을 trashed_at 하나로 통일한다(kickoff:
-- d1-source-trash-purge). 지우면 즉시 안 보이고, 30일 뒤 배치가 완전히
-- 지운다(purge는 다음 마이그레이션). 그 사이엔 되살릴 수 있다.
--
-- source_status 같은 enum은 만들지 않는다 — sources에 이미 digestion_status가
-- 있어 상태 축을 둘로 만들 이유가 없다. trashed_at의 null 여부가 곧 상태다.
--
-- 3단 상속(보임/안 보임 판정):
--   원문이 보인다      = sources.trashed_at IS NULL
--   다이제스트가 보인다 = 자기 trashed_at IS NULL AND 부모 원문이 보인다
--   관계가 보인다      = 양 끝 다이제스트가 둘 다 보인다
-- digest_relations는 끝점에서 파생이라 컬럼을 더하지 않는다 — 관계 자신은
-- 아무 상태도 안 가진다.
--
-- legacy(20260706112433_source_status_v2.sql)에서 trashed_at·trash_source·
-- restore_trashed_source를 옮겨 적되 두 가지를 바꿨다:
--   1) status enum의 pending 가드를 뺐다 — legacy는 원문 삭제가 active→pending
--      →trashed 2단계였고 우리는 그 되돌리기가 없다. 가드를 그대로 베끼면
--      정상적인 삭제가 전부 막힌다.
--   2) RAISE EXCEPTION 대신 boolean을 반환한다 — 우리 SourceDeleteResult 계약
--      ("이미 없는/남의 sourceId도 에러 아님, success:false")을 그대로 지키려면
--      RPC가 실패를 예외가 아니라 반환값으로 알려야 한다.
--   3) RLS 술어는 is_space_member(space_id) 대신 우리 소유 판정(user_id =
--      auth.uid())을 쓴다 — Space가 없다.
-- =============================================================

ALTER TABLE sources ADD COLUMN trashed_at timestamptz;

COMMENT ON COLUMN sources.trashed_at IS
  '휴지통행 시각 — NULL이면 살아있음. 30일 뒤 purge_expired_sources가 이 시각
   기준으로 완전 삭제 대상을 고른다(다음 마이그레이션). digests.trashed_at과
   달리 CASCADE 삭제의 기준이 되므로 인덱스를 건다(아래).';

-- purge_expired_sources가 매일 훑는 조회 경로 — trashed 아닌 행(대다수)은
-- 인덱스에 아예 안 들어가 부분 인덱스로 충분히 작다.
CREATE INDEX idx_sources_trashed_at ON sources (trashed_at)
  WHERE trashed_at IS NOT NULL;

-- =============================================================
-- digests.hidden_at → trashed_at — 다이제스트 단독 삭제 표시도 같은 이름으로
-- 통일한다. 뜻은 그대로다(가림 = Postgres 행은 남기고 화면에서만 뺌).
-- =============================================================

ALTER TABLE digests RENAME COLUMN hidden_at TO trashed_at;

COMMENT ON COLUMN digests.trashed_at IS
  '삭제 표시 — NULL이면 살아있음. 부모 원문이 trashed면 이 값이 NULL이어도 안
   보인다(3단 상속, v_visible_digests 참고) — 원문을 휴지통에 넣을 때 딸린
   다이제스트 각각의 trashed_at을 건드리지 않는 이유다.';

-- =============================================================
-- 휴지통 넣기/꺼내기 — 원문 trashed 진입·복귀의 유일한 경로.
-- 딸린 다이제스트 행은 안 건드린다 — 가시성은 v_visible_digests가 부모 조인으로
-- 매번 계산하므로, 원문 하나만 바꾸면 다이제스트 전체가 함께 안 보이거나 다시
-- 보인다. 벡터(Qdrant) 정리·재색인은 여기 없다 — 서버가 이 함수 호출 앞뒤로 붙인다
-- (source-service.ts deleteSource/restoreSource).
-- =============================================================

CREATE FUNCTION trash_source(p_source_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE sources
  SET trashed_at = now()
  WHERE id = p_source_id AND trashed_at IS NULL AND user_id = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE FUNCTION restore_trashed_source(p_source_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE sources
  SET trashed_at = NULL
  WHERE id = p_source_id AND trashed_at IS NOT NULL AND user_id = auth.uid();

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION trash_source IS
  '원문을 휴지통에 넣는다. 대상이 없거나(이미 trashed 포함) 내 것이 아니면
   false — 에러로 던지지 않는다(SourceDeleteResult 계약). 조건 없이 보낸다:
   legacy와 달리 원문이 거칠 pending 단계가 없다.';
COMMENT ON FUNCTION restore_trashed_source IS
  '휴지통의 원문을 되살린다. 대상이 없거나(trashed가 아님 포함) 내 것이 아니면
   false. 실수 복구용이라 드물게 불린다 — 호출 뒤 서버가 딸린 다이제스트를
   다시 색인한다.';

REVOKE ALL ON FUNCTION trash_source FROM public, anon;
GRANT EXECUTE ON FUNCTION trash_source TO authenticated, service_role;

REVOKE ALL ON FUNCTION restore_trashed_source FROM public, anon;
GRANT EXECUTE ON FUNCTION restore_trashed_source TO authenticated, service_role;

-- =============================================================
-- 보이는 것만 돌려주는 조회 전용 뷰 — 3단 상속 판정을 한 자리로 모은다.
-- sources를 읽는 자리(source-service 다수)와 digests를 읽는 자리
-- (digest-service·digest-relation-service 다수)가 저마다 trashed_at 조건을
-- 반복해 적지 않도록, 판정 자체를 여기 한 번만 적는다 — 두 군데 이상 적히면
-- 잘못 간 것이다(kickoff).
--
-- v_draft_sources와 같은 관례로 security_invoker=true — 뷰 소유자 권한으로
-- RLS(owner-only)가 새지 않게 한다.
-- =============================================================

CREATE VIEW v_visible_sources WITH (security_invoker = true) AS
SELECT
  s.id, s.user_id, s.name, s.title, s.body, s.body_preview,
  s.digestion_status, s.public_id, s.created_at, s.updated_at
FROM sources s
WHERE s.trashed_at IS NULL;

COMMENT ON VIEW v_visible_sources IS
  '휴지통에 없는 원문만. sources를 직접 읽는 대신 이 뷰를 쓰면 trashed_at IS
   NULL 조건을 호출부마다 반복할 필요가 없다. 원문 자체를 쓰는(INSERT/UPDATE)
   경로는 여전히 sources 테이블을 그대로 쓴다 — 이 뷰는 읽기 전용 판정 자리다.';

CREATE VIEW v_visible_digests WITH (security_invoker = true) AS
SELECT
  d.id, d.source_id, d.type, d.title, d.body, d.extraction_order,
  d.public_id, d.created_at, d.updated_at
FROM digests d
JOIN v_visible_sources s ON s.id = d.source_id
WHERE d.trashed_at IS NULL;

COMMENT ON VIEW v_visible_digests IS
  '보이는 다이제스트만 — 자기 trashed_at이 NULL이고 부모 원문도 보일 때
   (v_visible_sources 조인). "다이제스트가 보인다"의 유일한 정의 자리 — 검색
   ·상세 조회·관계 후보 찾기가 전부 이 뷰를 통해 읽는다.';

-- listSourcesWithDigests(다이제스트 목록 화면)만 예외다 — digests!inner로
-- 중첩해 받되 가려진 digest도 다 받아 온 뒤 JS에서 거른다(source-service.ts
-- toSourceWithDigests) — 그래야 다이제스트가 전부 가려진 원문도 목록에 남는다
-- (원문을 지울 진입점 유지). 그 자리는 v_visible_digests를 못 쓴다 — INNER
-- JOIN 뷰가 미리 걸러버리면 "다이제스트 0개"인 원문이 통째로 빠진다.

-- =============================================================
-- v_draft_sources — 휴지통 원문은 초안 화면에도 안 뜬다.
-- =============================================================

CREATE OR REPLACE VIEW v_draft_sources WITH (security_invoker = true) AS
SELECT s.id, s.name, s.created_at, s.digestion_status, s.body_preview
FROM sources s
WHERE s.trashed_at IS NULL
  AND (s.digestion_status = 'pending'
       OR NOT EXISTS (SELECT 1 FROM digests d WHERE d.source_id = s.id));

-- =============================================================
-- Reference 삭제 (07-modeling §완전 삭제) — trashed 전이 + 30일 배치 완전 삭제
--
-- Reference는 지금까지 archive(정리)만 있고 삭제가 없었다(reference_status에
-- trashed 자체가 없음). intake-flow "레퍼런스 삭제" 2케이스(인용 없음/있음)의
-- 확인 분기(가벼운 확인 vs 이름 타이핑 확인)는 전부 FE 몫 — 서버는 active→trashed
-- 전이 RPC 하나와 보관기간 지난 것들을 치우는 배치 RPC 하나만 가진다.
-- source_status_v2·source_purge와 같은 모양.
--
-- Reference는 임베딩 대상이 아니므로(07-modeling: Reference는 벡터 검색 색인 밖 —
-- 진술만 임베딩된다) source_purge의 vector_purge 큐 연동이 필요 없다 — purge는
-- 순수 관계형 DELETE 하나. digest_references·statement_references·reference_links는
-- 전부 reference_id를 ON DELETE CASCADE로 걸어뒀으니(20260706105655·114518·115232)
-- Reference가 지워지면 인용·링크 행도 함께 사라진다. Digest 본문의 @[ref:uuid]
-- 마커는 그 자체론 FK가 아니라(자유 텍스트 안 마커) 안 지워지고 그대로 남는데,
-- 이게 곧 "죽은 링크"의 데이터 쪽 절반이다 — 렌더링에서 대상을 못 찾아 죽은
-- 링크로 그리는 건 Digest 상세 화면이 생길 때의 몫(이번 슬라이스 밖, 데이터
-- 정합성만 여기서 맞춘다).
-- =============================================================

-- =============================================================
-- 1) reference_status에 trashed 추가 + trashed_at
--
--    같은 트랜잭션에서 이 값을 CHECK 제약·RPC 본문에 바로 써야 해서(뒤 2)·3)),
--    같은 트랜잭션 안 사용이 없어야만 안전한 ADD VALUE 지름길(20260706115232의
--    duplicates가 그 경우) 대신 source_status_v2와 같은 통째 재생성 방식을 쓴다 —
--    새로 만든 타입은 트랜잭션 제약 없이 바로 쓸 수 있다.
-- =============================================================

ALTER TYPE reference_status RENAME TO reference_status_old;
CREATE TYPE reference_status AS ENUM ('active', 'archived', 'trashed');

ALTER TABLE "references" ALTER COLUMN status DROP DEFAULT;
ALTER TABLE "references" ALTER COLUMN status TYPE reference_status
  USING status::text::reference_status;
ALTER TABLE "references" ALTER COLUMN status SET DEFAULT 'active';

DROP TYPE reference_status_old;

ALTER TABLE "references" ADD COLUMN trashed_at timestamptz;

-- trashed면 반드시 시각이 있고, 아니면 반드시 없다 (sources와 같은 계약)
ALTER TABLE "references" ADD CONSTRAINT chk_reference_trashed_at_iff_trashed CHECK (
  (status = 'trashed') = (trashed_at IS NOT NULL)
);

-- =============================================================
-- 2) trash_reference — active → trashed 전이만
--    (인용 없음/있음에 따른 확인 분기는 FE 몫, RPC는 전이 하나로 공용)
--
--    archive_reference와 같은 모양이되 변경이력은 안 남긴다: Reference는
--    워크스페이스 그래프 안이라 archive_reference는 "정리"의 되돌림 가능성을
--    위해 changeset을 남기지만, 삭제는 이번 슬라이스에 복원 표면이 없다
--    (source의 trash_source와 같은 결 — "복원 표면 없음"). 남길 이력의
--    소비자가 없는 changeset은 안 만든다 — 복원 UI가 생기면 그때 추가한다.
-- =============================================================

CREATE FUNCTION trash_reference(p_reference_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE "references"
  SET status = 'trashed', trashed_at = now()
  WHERE id = p_reference_id AND status = 'active'
    AND (auth.uid() IS NULL OR is_workspace_member(workspace_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reference % is not an active reference the caller can trash', p_reference_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) purge_expired_references — 보관기간 지난 trashed Reference를 배치로 완전 삭제
--
--    purge_expired_sources를 미러링하되 벡터 정리 단계가 없어 훨씬 단순하다 —
--    대상을 집어 그대로 DELETE, 나머지(인용·링크)는 reference_id CASCADE가 처리한다.
--    SKIP LOCKED — pg_cron 단일 실행이지만 수동/운영 호출과 겹쳐도 안전.
-- =============================================================

CREATE FUNCTION purge_expired_references(
  p_retention_days int DEFAULT 30,   -- 07-modeling: 보관 기간 30일 (Source와 동일)
  p_batch_limit    int DEFAULT 100
)
RETURNS int AS $$
DECLARE
  v_reference_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_reference_ids
  FROM (
    SELECT id FROM "references"
    WHERE status = 'trashed'
      AND trashed_at + make_interval(days => p_retention_days) < now()
    ORDER BY trashed_at
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ) picked;

  IF v_reference_ids IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM "references" WHERE id = ANY(v_reference_ids);

  RETURN array_length(v_reference_ids, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions — 사용자 경로(authenticated) + 운영자(service_role).
-- purge는 배치·운영자 전용(source_purge와 동일하게 authenticated 제외).
-- =============================================================

REVOKE ALL ON FUNCTION trash_reference(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION trash_reference(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION purge_expired_references(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_references(int, int) TO service_role;

-- =============================================================
-- 4) pg_cron — 매일 실행 (purge-expired-sources와 같은 스케줄 패턴).
--    03:05 UTC — sources 배치(03:00)와 겹치지 않게 5분 띄운다. 이름 있는 잡이라
--    재적용 시 upsert. 워치독(purge_job_last_success)은 이번 슬라이스에 없음 —
--    필요해지면 job명을 인자로 받게 일반화해서 추가한다.
-- =============================================================

SELECT cron.schedule('purge-expired-references', '5 3 * * *',
  $$ SELECT purge_expired_references(); $$);

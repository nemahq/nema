-- =============================================================
-- 원문 완전 삭제(purge) — 보관기간(30일) 지난 trashed 원문을 배치로 hard delete.
--
-- legacy(20260708090000_source_purge.sql)에서 옮겨 적되 우리 스키마·아키텍처
-- 차이만큼 덜어냈다:
--   1) statements 테이블이 없다 — legacy의 1)절(statements.digest_id를 CASCADE로
--      푸는 부분)과, purge 함수 안에서 진술 id를 모으는 부분이 통째로 사라진다.
--      digests.source_id·digest_relations의 두 FK가 이미 ON DELETE CASCADE라
--      (20260810135811, 20260813121456) 손댈 제약이 없다.
--   2) pgmq 큐가 없다 — 그리고 필요 없다. legacy는 벡터 삭제가 서버 코드 밖(DB
--      배치)에서 일어나 큐로 워커에 넘겼지만, 우리는 삭제 시점(trash_source 호출
--      직후, deleteSource)에 이미 벡터를 지운다. purge가 집어가는 시점엔 지울
--      벡터가 남아있지 않다 — pgmq.create·read_vector_purge_events·
--      ack_vector_purge_event 전부 안 옮긴다.
--   3) WHERE status = 'trashed' → WHERE trashed_at IS NOT NULL — enum을 안
--      만들기로 했다(20260814102018).
--
-- 잡의 주인은 DB(pg_cron), 감시는 서버 몫이나 이번 슬라이스엔 안 붙인다 —
-- apps/server/src/infra/에 아직 워치독을 걸 워커(legacy의 statement-sync 같은)가
-- 없다. purge_job_last_success()는 만들어 두되 호출부는 없다.
-- TODO: 그런 워커가 생기면 purge_job_last_success()로 "잡이 조용히 멈췄나"를
-- 반드시 감시에 이어붙인다 — 지금은 잡이 멈춰도 아무도 모른다.
-- =============================================================

CREATE FUNCTION purge_expired_sources(
  p_retention_days int DEFAULT 30,   -- 보관 기간 30일(kickoff)
  p_batch_limit    int DEFAULT 100
)
RETURNS int AS $$
DECLARE
  v_source_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_source_ids
  FROM (
    SELECT id FROM sources
    WHERE trashed_at IS NOT NULL
      AND trashed_at + make_interval(days => p_retention_days) < now()
    ORDER BY trashed_at
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ) picked;

  IF v_source_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- 딸린 digests·digest_relations는 FK CASCADE가 지운다(위 주석 1). Qdrant 벡터는
  -- 이미 trash_source 시점에 지워져 있어 여기서 더 정리할 것이 없다(위 주석 2).
  DELETE FROM sources WHERE id = ANY(v_source_ids);

  RETURN array_length(v_source_ids, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION purge_expired_sources IS
  '보관기간 지난 휴지통 원문을 배치로 완전 삭제한다. 원문만 집어간다 —
   다이제스트만 지운 경우는 원문이 살아있는 한 휴지통에 계속 남는다(정리 품질
   지표로 필요, kickoff). 반환값은 이번에 지운 원문 수. FOR UPDATE SKIP
   LOCKED — pg_cron 단일 실행이 기본이지만 수동 호출과 겹쳐도 안전하다.';

REVOKE ALL ON FUNCTION purge_expired_sources(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_sources(int, int) TO service_role;

-- =============================================================
-- pg_cron — 매일 03:00 UTC 실행. 이름 있는 잡이라 재적용 시 upsert된다.
-- 보관기간이 30일로 거칠어 정확한 실행 시각은 무의미하다.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('purge-expired-sources', '0 3 * * *',
  $$ SELECT purge_expired_sources(); $$);

-- =============================================================
-- purge_job_last_success — 워치독용, 이번 슬라이스는 호출부 없이 함수만 둔다.
-- cron 스키마는 PostgREST에 노출되지 않으므로 SECURITY DEFINER로 감싸 public에
-- 편입한다.
-- =============================================================

CREATE FUNCTION purge_job_last_success()
RETURNS timestamptz AS $$
  SELECT max(d.end_time)
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'purge-expired-sources' AND d.status = 'succeeded';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, cron;

COMMENT ON FUNCTION purge_job_last_success IS
  '워치독용 — purge-expired-sources 잡이 마지막으로 성공한 시각. "밀린 원문
   개수"가 아니라 "잡이 실제로 돌았나"로 정지를 판정하게 한다(대량 휴지통을
   배치 한도로 여러 날 나눠 비우는 정상 상황에 헛경보가 안 나도록). 호출부는
   이번 슬라이스에 없다 — apps/server/src/infra/에 아직 이 함수를 부를 워커가
   없다(파일 상단 TODO 참고).';

REVOKE ALL ON FUNCTION purge_job_last_success() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_job_last_success() TO service_role;

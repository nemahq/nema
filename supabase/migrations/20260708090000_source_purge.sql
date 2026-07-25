-- =============================================================
-- 원문 완전 삭제(purge) — 보관기간 지난 trashed Source를 배치로 hard delete
--
-- 07-modeling §완전 삭제: trashed_at + 보관기간(30일)이 지난 원문을 배치가 완전
-- 삭제한다. 이 슬라이스에서 확정한 설계:
--   - purge = `DELETE FROM sources` 한 번. 파생물(Digest·진술·관계·그 원문의
--     changeset·change)은 이미 걸린 source_id CASCADE로 함께 사라진다. Reference는
--     workspace_id에 매달려 원문 삭제 그물에 안 걸려 생존한다 — Workspace 공유
--     자원이라 다른 원문이 인용 중일 수 있어 지우면 안 된다. revert·cross-source가
--     남기는 change는 changes.target_id가 FK 없는 이력이라(schema-design 4.3)
--     대상이 사라져도 무해하게 남는다(archive·관계 create라 원문 스냅샷도 없음).
--   - 잡의 주인은 DB(pg_cron), 감시는 서버(워커 워치독이 밀린 삭제 시 Sentry 경고).
--
-- 막힌 곳은 딱 하나다: statements.digest_id가 NO ACTION이라 "진술 붙은 Digest 삭제"를
-- 막아 원문→Digest CASCADE를 튕긴다. 이걸 CASCADE로 바꾸면 원문 삭제가
-- Digest→진술→관계까지 흐른다(나머지 FK는 이미 CASCADE).
--
-- 벡터 정리: 진술 hard delete는 Qdrant 임베딩을 고아로 남긴다 — 임베딩 패스는
-- archived '행'을 읽어 벡터를 지우는데(worker runEmbeddingPass) purge는 행을
-- 없애 그 경로가 못 본다. 정상 흐름(되돌리기→archived)에선 이미 지워지지만, 벡터
-- 삭제가 failed로 굳은 진술이 고아로 남을 수 있어 purge가 직접 책임진다. purge RPC가
-- 지울 진술 id를 같은 트랜잭션에서 vector_purge 큐에 넣고(삭제 전 — 크래시로 "행은
-- 지웠는데 정리 목록은 없는" 영구 고아 방지), 워커가 드레인해 Qdrant에서 지운다
-- (Qdrant point id = statement_id라 행이 없어도 되고, 이미 지워진 것과 겹쳐도 멱등).
-- =============================================================

-- =============================================================
-- 1) statements.digest_id → ON DELETE CASCADE
--    원문→Digest→진술 연쇄를 막던 NO ACTION을 푼다. Digest 삭제는 원문 완전 삭제와
--    Space 삭제 때만 일어나고, 둘 다 그 Digest의 진술도 함께 지우는 게 맞다.
-- =============================================================

ALTER TABLE statements DROP CONSTRAINT statements_digest_id_fkey;
ALTER TABLE statements
  ADD CONSTRAINT statements_digest_id_fkey
  FOREIGN KEY (digest_id) REFERENCES digests(id) ON DELETE CASCADE;

-- =============================================================
-- 2) vector_purge 큐 — hard delete된 진술 id를 워커가 Qdrant에서 지우도록 넘긴다
-- =============================================================

SELECT pgmq.create('vector_purge');

-- =============================================================
-- 2.5) legacy null-digest 진술 정리 + digest_id NOT NULL
--
--   v2는 모든 진술이 digest에서 추출된다(apply_extraction_statements가 강제). digest_id가
--   NULL인 진술은 digest 도입(2026-07-06) 이전 v1 잔재로 v2 모델 밖이고, purge는 진술을
--   digest 경로(원문→Digest→진술)로만 지우므로 이들을 남기면 원문 완전 삭제 시 고아가 된다.
--   지금 정리하고 NOT NULL로 못박아 그 구멍을 원천 차단한다(현 데이터는 전부 테스트용이라
--   삭제 합의 — Kyle). 삭제분의 Qdrant 벡터도 vector_purge로 넘겨 워커가 정리한다.
-- =============================================================

DO $$
DECLARE
  v_legacy_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_legacy_ids FROM statements WHERE digest_id IS NULL;
  IF v_legacy_ids IS NOT NULL THEN
    PERFORM pgmq.send('vector_purge',
      jsonb_build_object('statement_ids', to_jsonb(v_legacy_ids)));
    DELETE FROM statements WHERE id = ANY(v_legacy_ids);
  END IF;
END $$;

ALTER TABLE statements ALTER COLUMN digest_id SET NOT NULL;

-- =============================================================
-- 3) purge_expired_sources — 보관기간 지난 trashed 원문을 배치로 완전 삭제
--
--    삭제 대상 원문을 배치로 집어, 그 원문들의 Digest에 매달린 진술 id를 미리 모아
--    vector_purge에 예약한 뒤, 원문을 DELETE한다. 나머지는 source_id CASCADE가
--    처리한다. 반환값은 이번에 지운 원문 수.
--    SKIP LOCKED — pg_cron 단일 실행이지만 수동/운영 호출과 겹쳐도 안전.
-- =============================================================

CREATE FUNCTION purge_expired_sources(
  p_retention_days int DEFAULT 30,   -- 07-modeling: 보관 기간 30일
  p_batch_limit    int DEFAULT 100
)
RETURNS int AS $$
DECLARE
  v_source_ids    uuid[];
  v_statement_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_source_ids
  FROM (
    SELECT id FROM sources
    WHERE status = 'trashed'
      AND trashed_at + make_interval(days => p_retention_days) < now()
    ORDER BY trashed_at
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ) picked;

  IF v_source_ids IS NULL THEN
    RETURN 0;
  END IF;

  -- hard delete될 진술 id를 미리 모은다(삭제 후엔 행이 없다) — 이 원문들의 Digest에
  -- 매달린 진술 전부. digest_id NOT NULL(2.5)이라 이 원문의 진술이 빠짐없이 잡히고,
  -- CASCADE가 지울 집합과 정확히 같다.
  SELECT array_agg(s.id) INTO v_statement_ids
  FROM statements s
  JOIN digests d ON d.id = s.digest_id
  WHERE d.source_id = ANY(v_source_ids);

  IF v_statement_ids IS NOT NULL THEN
    PERFORM pgmq.send('vector_purge',
      jsonb_build_object('statement_ids', to_jsonb(v_statement_ids)));
  END IF;

  DELETE FROM sources WHERE id = ANY(v_source_ids);

  -- 워커를 깨워 벡터 정리를 곧바로 돌린다(안 깨워도 sweep이 줍지만 지연을 없앤다).
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN array_length(v_source_ids, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION purge_expired_sources(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_sources(int, int) TO service_role;

-- =============================================================
-- 4) vector_purge 큐 read/ack (워커 전용) — statement_sync 큐 RPC와 같은 패턴
-- =============================================================

CREATE FUNCTION read_vector_purge_events(
  p_batch_size         int DEFAULT 10,
  p_visibility_timeout int DEFAULT 60
)
RETURNS TABLE (msg_id bigint, message jsonb) AS $$
BEGIN
  RETURN QUERY
  SELECT r.msg_id, r.message
  FROM pgmq.read('vector_purge', p_visibility_timeout, p_batch_size) r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

CREATE FUNCTION ack_vector_purge_event(p_msg_id bigint)
RETURNS void AS $$
BEGIN
  PERFORM pgmq.archive('vector_purge', p_msg_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION read_vector_purge_events(int, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION read_vector_purge_events(int, int) TO service_role;

REVOKE ALL ON FUNCTION ack_vector_purge_event(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION ack_vector_purge_event(bigint) TO service_role;

-- =============================================================
-- 5) pg_cron — 매일 purge 실행 (잡의 주인은 DB)
--
--    이름 있는 잡이라 재적용 시 upsert. 매일 03:00 UTC — 보관기간이 30일로 거칠어
--    정확한 실행 시각은 무의미하다. 실행 이력은 cron.job_run_details가 남기고,
--    잡이 조용히 멈춘 경우는 서버 워커의 워치독이 Sentry로 알린다.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule('purge-expired-sources', '0 3 * * *',
  $$ SELECT purge_expired_sources(); $$);

-- =============================================================
-- 6) purge_job_last_success — 워치독용 pg_cron 잡 마지막 성공 시각
--
--    워커 워치독이 "밀린 원문 개수"가 아니라 "잡이 실제로 돌았나"로 정지를 판정하게 한다 —
--    대량 휴지통을 여러 날 나눠 비우는 정상 상황(배치 한도)에도 헛경보가 안 나게. cron
--    스키마는 PostgREST에 노출되지 않으므로 SECURITY DEFINER로 감싸 public에 편입한다.
-- =============================================================

CREATE FUNCTION purge_job_last_success()
RETURNS timestamptz AS $$
  SELECT max(d.end_time)
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = 'purge-expired-sources' AND d.status = 'succeeded';
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public, cron;

REVOKE ALL ON FUNCTION purge_job_last_success() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION purge_job_last_success() TO service_role;

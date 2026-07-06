-- =============================================================
-- Digest 파이프라인 1단계 — 생성(digestion) 스테이지 + 리뷰 게이트
--
-- 07-modeling 확정 동작: ingestion changeset은 항상 pending으로 시작하고,
-- Digest·Reference 후보를 사람이 확인해야(Digest 리뷰) applied로 전환되며
-- 그 순간 Statement 추출(2단계)이 시작된다. 이 마이그레이션은 그 1단계를 깐다:
--
-- 1) sources에 digestion 작업 컬럼 — 추출·잇기와 같은 3-상태 + lease 클레임 패턴
-- 2) digest_topics / digest_tags — 리뷰 확정 시 붙는 라벨 연결
--    (create_digests 마이그레이션이 "인테이크 개편으로 미룸"이라 비워둔 자리)
-- 3) create_source — 원본을 status='pending'으로 박제 (v2 전이 사슬의 시작점)
-- 4) fetch_pending_sources — status='active' 게이트: 리뷰 확정 전엔 추출 금지
--    + lease 150초 복원 (temporal_deadline_rpcs 재작성이 30초로 되돌린 회귀 —
--    extraction_lease_covers_slow_provider가 정한 값: 120초 LLM 타임아웃을 덮어야 한다)
-- 5) 워커 RPC: fetch_pending_digestion_sources / create_ingestion_review /
--    complete_source_digestion / increment_source_digestion_retry / retry_source_digestion
-- 6) 리뷰 RPC: update_pending_ingestion(초안 편집) / confirm_ingestion_review(확정)
-- =============================================================

-- =============================================================
-- 1) sources — digestion 작업 상태 (추출·잇기와 대칭)
-- =============================================================

ALTER TABLE sources
  ADD COLUMN digestion_status       ingestion_status NOT NULL DEFAULT 'pending',
  ADD COLUMN digestion_retry_count  int NOT NULL DEFAULT 0,
  ADD COLUMN last_digestion_attempt timestamptz;

-- 기존 원본은 전부 v1 파이프라인(추출 직행) 산물 — Digest 단계를 소급하지 않는다
UPDATE sources SET digestion_status = 'completed';

CREATE INDEX idx_sources_digestion_pending ON sources (id)
  WHERE digestion_status = 'pending';

-- =============================================================
-- 2) digest_topics / digest_tags — 리뷰 확정 시 붙는 라벨
-- =============================================================

CREATE TABLE digest_topics (
  digest_id  uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_id, topic_id)
);
CREATE INDEX idx_digest_topics_topic ON digest_topics (topic_id);

CREATE TABLE digest_tags (
  digest_id  uuid NOT NULL REFERENCES digests(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (digest_id, tag_id)
);
CREATE INDEX idx_digest_tags_tag ON digest_tags (tag_id);

-- Topic은 Space 스코프 라벨 — 경계를 가로지르면 스레드 계산이 남의 Space를 본다
CREATE OR REPLACE FUNCTION enforce_digest_topic_same_space()
RETURNS trigger AS $$
DECLARE
  v_digest_space uuid;
  v_topic_space  uuid;
BEGIN
  SELECT space_id INTO v_digest_space FROM digests WHERE id = NEW.digest_id;
  SELECT space_id INTO v_topic_space  FROM topics  WHERE id = NEW.topic_id;

  IF v_digest_space IS DISTINCT FROM v_topic_space THEN
    RAISE EXCEPTION 'digest_topics requires digest and topic in the same space (digest: %, topic: %)',
      v_digest_space, v_topic_space;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_digest_topics_same_space
  BEFORE INSERT OR UPDATE ON digest_topics
  FOR EACH ROW EXECUTE FUNCTION enforce_digest_topic_same_space();

-- Tag는 Workspace 스코프 라벨 — Space는 가로질러도 Workspace 경계는 못 넘는다
CREATE OR REPLACE FUNCTION enforce_digest_tag_same_workspace()
RETURNS trigger AS $$
DECLARE
  v_digest_workspace uuid;
  v_tag_workspace    uuid;
BEGIN
  SELECT sp.workspace_id INTO v_digest_workspace
  FROM digests d JOIN spaces sp ON sp.id = d.space_id
  WHERE d.id = NEW.digest_id;
  SELECT workspace_id INTO v_tag_workspace FROM tags WHERE id = NEW.tag_id;

  IF v_digest_workspace IS DISTINCT FROM v_tag_workspace THEN
    RAISE EXCEPTION 'digest_tags requires digest and tag in the same workspace (digest: %, tag: %)',
      v_digest_workspace, v_tag_workspace;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_digest_tags_same_workspace
  BEFORE INSERT OR UPDATE ON digest_tags
  FOR EACH ROW EXECUTE FUNCTION enforce_digest_tag_same_workspace();

ALTER TABLE digest_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest_tags   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "digest_topics_member_select" ON digest_topics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM digests d
      WHERE d.id = digest_id AND is_space_member(d.space_id)
    )
  );

CREATE POLICY "digest_tags_member_select" ON digest_tags
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM digests d
      WHERE d.id = digest_id AND is_space_member(d.space_id)
    )
  );

-- =============================================================
-- 3) create_source — pending으로 박제 (v2 전이 사슬 active→는 리뷰 확정이 맡음)
-- =============================================================

CREATE OR REPLACE FUNCTION create_source(
  p_space_id        uuid,
  p_body            text,
  p_session_id      uuid DEFAULT NULL,
  p_author_timezone text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_source_id uuid;
BEGIN
  -- SECURITY DEFINER라 RLS를 안 타므로 소유 검증은 RPC 몫
  IF NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', p_space_id;
  END IF;

  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'p_body must be a non-empty text';
  END IF;

  -- status='pending': 파생된 게 없는 상태(07-modeling). Digest 리뷰 확정이 active로 민다.
  INSERT INTO sources (space_id, author_id, session_id, body, author_timezone, status)
  VALUES (p_space_id, auth.uid(), p_session_id, p_body, p_author_timezone, 'pending')
  RETURNING id INTO v_source_id;

  -- digestion 워커 깨우기 (digestion_status가 pending으로 생성됨)
  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- 4) fetch_pending_sources — 추출은 리뷰 확정(active) 뒤에만
-- =============================================================

CREATE OR REPLACE FUNCTION fetch_pending_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  space_id        uuid,
  author_id       uuid,
  session_id      uuid,
  body            text,
  created_at      timestamptz,
  author_timezone text
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_extraction_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    WHERE s2.extraction_status = 'pending'
      -- 리뷰 게이트: pending 원본은 Digest 확정 전 — 추출이 앞서가면 안 된다
      AND s2.status = 'active'
      AND s2.extraction_retry_count < p_max_retries
      -- lease 150초: 120초 LLM 타임아웃을 덮는다(extraction_lease_covers_slow_provider).
      -- temporal_deadline_rpcs 재작성이 30초로 되돌렸던 회귀를 함께 복원.
      AND (s2.last_extraction_attempt IS NULL
           OR s2.last_extraction_attempt + (s2.extraction_retry_count + 1) * interval '150 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id, s.author_id, s.session_id, s.body, s.created_at, s.author_timezone;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 5) 워커 RPC — digestion 스테이지 (추출 스테이지와 대칭)
-- =============================================================

-- 인출 = 클레임(lease). workspace_id는 워커가 Tag·Reference 레지스트리(Workspace
-- 스코프)를 프롬프트에 실을 때 필요해서 함께 반환한다.
CREATE FUNCTION fetch_pending_digestion_sources(p_max_retries int DEFAULT 5)
RETURNS TABLE (
  id           uuid,
  space_id     uuid,
  workspace_id uuid,
  author_id    uuid,
  body         text,
  created_at   timestamptz
) AS $$
BEGIN
  RETURN QUERY
  UPDATE sources s
  SET last_digestion_attempt = now()
  FROM (
    SELECT s2.id
    FROM sources s2
    WHERE s2.digestion_status = 'pending'
      -- 생성은 리뷰 대기(pending) 원본만 — trashed는 배제, active는 이미 확정된 것
      AND s2.status = 'pending'
      AND s2.digestion_retry_count < p_max_retries
      AND (s2.last_digestion_attempt IS NULL
           OR s2.last_digestion_attempt + (s2.digestion_retry_count + 1) * interval '150 seconds' < now())
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  ) picked
  WHERE s.id = picked.id
  RETURNING s.id, s.space_id,
    (SELECT sp.workspace_id FROM spaces sp WHERE sp.id = s.space_id),
    s.author_id, s.body, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 후보가 하나도 안 나온 원본(정리할 판단이 없는 글) — changeset 없이 완료만.
-- 원본은 pending에 남아 사용자가 휴지통으로 보내는 것으로 정리한다.
CREATE FUNCTION complete_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL
  WHERE id = p_source_id AND digestion_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE FUNCTION increment_source_digestion_retry(
  p_source_id     uuid,
  p_max_retries   int DEFAULT 5,
  p_error_message text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- pending 가드: 늦게 도착한 재시도가 completed 행을 되살리지 못하게
  UPDATE sources
  SET digestion_retry_count  = digestion_retry_count + 1,
      last_digestion_attempt = now(),
      error_message          = COALESCE(p_error_message, error_message),
      digestion_status = CASE
        WHEN digestion_retry_count + 1 >= p_max_retries THEN 'failed'::ingestion_status
        ELSE 'pending'::ingestion_status
      END
  WHERE id = p_source_id AND digestion_status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE FUNCTION retry_source_digestion(p_source_id uuid)
RETURNS void AS $$
BEGIN
  -- service_role은 auth.uid()가 NULL(운영자 경로), 사용자는 멤버십 검증
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = p_source_id AND is_space_member(s.space_id)
  ) THEN
    RAISE EXCEPTION 'caller cannot access source %', p_source_id;
  END IF;

  -- last_digestion_attempt도 비워 lease 대기 없이 즉시 재인출되게 한다
  UPDATE sources
  SET digestion_status       = 'pending',
      digestion_retry_count  = 0,
      last_digestion_attempt = NULL,
      error_message          = NULL
  WHERE id = p_source_id AND digestion_status = 'failed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not failed', p_source_id;
  END IF;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- ----- 후보 적재의 공통 몸통 — create_ingestion_review(워커)와
--       update_pending_ingestion(리뷰 편집)이 같은 changes 형태를 쓴다 -----
--
-- p_digests 원소: { "title", "description", "body": {type,...}, "topics": [text],
--                   "tags": [{title, description}], "reference_ids": [uuid],
--                   "new_reference_keys": [text], "external_urls": [text] }
-- p_new_references 원소: { "key", "type", "title", "body" }
--
-- 신규 레퍼런스는 key → 예약 uuid로 해석해 digest data의 reference_ids에 합쳐 넣는다 —
-- 각 Change가 자기완결적이어야 확정·되돌리기·purge가 changes만 보고 움직일 수 있다.
CREATE FUNCTION write_ingestion_review_changes(
  p_changeset_id    uuid,
  p_digests         jsonb,
  p_new_references  jsonb
)
RETURNS void AS $$
DECLARE
  v_item      jsonb;
  v_key_ids   jsonb := '{}'::jsonb;
  v_ref_id    uuid;
  v_digest_id uuid;
  v_ref_ids   jsonb;
BEGIN
  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    v_ref_id := gen_random_uuid();
    v_key_ids := v_key_ids || jsonb_build_object(v_item->>'key', v_ref_id::text);
    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'reference', v_ref_id,
      jsonb_build_object(
        'type',  v_item->>'type',
        'title', v_item->>'title',
        'body',  v_item->>'body'
      )
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb))
  LOOP
    v_digest_id := gen_random_uuid();
    SELECT coalesce(jsonb_agg(DISTINCT refs.ref_id), '[]'::jsonb) INTO v_ref_ids
    FROM (
      SELECT value #>> '{}' AS ref_id
      FROM jsonb_array_elements(coalesce(v_item->'reference_ids', '[]'::jsonb))
      UNION ALL
      SELECT v_key_ids ->> (value #>> '{}')
      FROM jsonb_array_elements(coalesce(v_item->'new_reference_keys', '[]'::jsonb))
    ) refs
    WHERE refs.ref_id IS NOT NULL;

    INSERT INTO changes (changeset_id, action, target_type, target_id, data)
    VALUES (
      p_changeset_id, 'create', 'digest', v_digest_id,
      (v_item - 'new_reference_keys') || jsonb_build_object('reference_ids', v_ref_ids)
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 워커가 생성한 Digest·Reference 후보를 pending ingestion changeset으로 적재.
-- 완료 표시가 같은 트랜잭션이어야 하는 이유: 갈라지면 적재 성공 후 크래시 시
-- 워커가 같은 원본을 재생성해 리뷰 대기가 중복 생성된다(추출 RPC와 같은 계약).
CREATE FUNCTION create_ingestion_review(
  p_source_id      uuid,
  p_digests        jsonb,
  p_new_references jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_author_id    uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL
  WHERE id = p_source_id AND digestion_status = 'pending' AND status = 'pending'
  RETURNING space_id, author_id INTO v_space_id, v_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;

  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — use complete_source_digestion for empty results';
  END IF;

  -- author_id = 원본 제공자: ingestion은 사람 주도 변경셋(07-modeling authorId 규칙)
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 6) 리뷰 RPC — pending은 확정 전 초안(07-modeling): 자유 편집 + 확정
-- =============================================================

-- 초안 편집 — 리뷰 화면이 보낸 전체 상태로 changes를 통째로 교체한다.
-- 부분 패치가 아니라 전체 교체인 이유: pending 초안의 정체성은 "확정 시점의 내용"
-- 하나뿐이라, diff 병합의 복잡성을 질 이유가 없다.
CREATE FUNCTION update_pending_ingestion(
  p_changeset_id   uuid,
  p_digests        jsonb,
  p_new_references jsonb DEFAULT '[]'::jsonb
)
RETURNS void AS $$
DECLARE
  v_status changeset_status;
  v_type   changeset_type;
BEGIN
  SELECT status, type INTO v_status, v_type
  FROM changesets
  WHERE id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;
  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — trash the source instead';
  END IF;

  DELETE FROM changes WHERE changeset_id = p_changeset_id;
  PERFORM write_ingestion_review_changes(p_changeset_id, p_digests, p_new_references);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 확정 — 한 트랜잭션에서: 신규 Reference 생성 → Digest 생성 + 라벨·인용 연결 →
-- changeset applied → 원본 active(추출 게이트 열림) → 워커 notify.
-- 행 id는 change의 예약 target_id를 그대로 쓴다(apply_pending_relation과 같은 관용구) —
-- 이력의 target_id와 실제 행이 어긋나지 않는다.
CREATE FUNCTION confirm_ingestion_review(p_changeset_id uuid)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_source_id    uuid;
  v_status       changeset_status;
  v_type         changeset_type;
  v_author_id    uuid;
  v_workspace_id uuid;
  ch             record;
  v_name         text;
  v_topic_id     uuid;
  v_tag          jsonb;
  v_tag_id       uuid;
  v_ref          text;
BEGIN
  SELECT c.space_id, c.source_id, c.status, c.type
    INTO v_space_id, v_source_id, v_status, v_type
  FROM changesets c
  WHERE c.id = p_changeset_id
    AND (auth.uid() IS NULL OR is_space_member(c.space_id))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'changeset % not found or not accessible', p_changeset_id;
  END IF;
  IF v_type <> 'ingestion' OR v_status <> 'pending' THEN
    RAISE EXCEPTION 'changeset % is not a pending ingestion review', p_changeset_id;
  END IF;

  -- 원본이 리뷰 대기 상태여야 한다 — 휴지통으로 간 원본의 리뷰는 확정 불가
  SELECT s.author_id, sp.workspace_id INTO v_author_id, v_workspace_id
  FROM sources s JOIN spaces sp ON sp.id = s.space_id
  WHERE s.id = v_source_id AND s.status = 'pending'
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not awaiting review', v_source_id;
  END IF;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'reference' AND action = 'create'
  LOOP
    INSERT INTO "references" (id, workspace_id, type, title, body)
    VALUES (
      ch.target_id, v_workspace_id,
      (ch.data->>'type')::reference_type, ch.data->>'title', ch.data->>'body'
    );
  END LOOP;

  FOR ch IN
    SELECT * FROM changes
    WHERE changeset_id = p_changeset_id AND target_type = 'digest' AND action = 'create'
  LOOP
    INSERT INTO digests (id, source_id, space_id, title, description, body, external_urls, author_id)
    VALUES (
      ch.target_id, v_source_id, v_space_id,
      ch.data->>'title', ch.data->>'description', ch.data->'body',
      CASE WHEN jsonb_array_length(coalesce(ch.data->'external_urls', '[]'::jsonb)) > 0
        THEN (SELECT array_agg(value #>> '{}') FROM jsonb_array_elements(ch.data->'external_urls'))
      END,
      v_author_id
    );

    -- 주제 레지스트리 find-or-create + 연결 (confirm_draft의 관용구 계승)
    FOR v_name IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'topics', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(v_name) = '';
      -- DO UPDATE는 충돌 시 RETURNING을 켜는 관용구(기존 주제 재사용도 id 반환)
      INSERT INTO topics (space_id, name)
      VALUES (v_space_id, btrim(v_name))
      ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id INTO v_topic_id;

      INSERT INTO digest_topics (digest_id, topic_id)
      VALUES (ch.target_id, v_topic_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- 태그 레지스트리 find-or-create — 기존 태그의 정의(description)는 덮지 않는다:
    -- 정의는 재사용 판단 기준이라 리뷰 한 번이 조용히 바꾸면 안 된다
    FOR v_tag IN
      SELECT value FROM jsonb_array_elements(coalesce(ch.data->'tags', '[]'::jsonb))
    LOOP
      CONTINUE WHEN btrim(coalesce(v_tag->>'title', '')) = '';
      INSERT INTO tags (workspace_id, title, description)
      VALUES (v_workspace_id, btrim(v_tag->>'title'), coalesce(v_tag->>'description', ''))
      ON CONFLICT (workspace_id, title) DO UPDATE SET title = EXCLUDED.title
      RETURNING id INTO v_tag_id;

      INSERT INTO digest_tags (digest_id, tag_id)
      VALUES (ch.target_id, v_tag_id)
      ON CONFLICT DO NOTHING;
    END LOOP;

    FOR v_ref IN
      SELECT value #>> '{}' FROM jsonb_array_elements(coalesce(ch.data->'reference_ids', '[]'::jsonb))
    LOOP
      INSERT INTO digest_references (digest_id, reference_id)
      VALUES (ch.target_id, v_ref::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  UPDATE changesets SET status = 'applied' WHERE id = p_changeset_id;

  -- 리뷰 확정 = 원본 active 전이(07-modeling: active는 확정된 Digest가 있는 상태).
  -- extraction_status는 pending 그대로라 게이트가 열리는 순간 추출 대상이 된다.
  UPDATE sources SET status = 'active' WHERE id = v_source_id;

  PERFORM pgmq.send('statement_sync', jsonb_build_object('type', 'notify'));

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions
-- =============================================================

-- 워커 전용
REVOKE ALL ON FUNCTION
  fetch_pending_digestion_sources(int),
  complete_source_digestion(uuid),
  increment_source_digestion_retry(uuid, int, text),
  create_ingestion_review(uuid, jsonb, jsonb)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  fetch_pending_digestion_sources(int),
  complete_source_digestion(uuid),
  increment_source_digestion_retry(uuid, int, text),
  create_ingestion_review(uuid, jsonb, jsonb)
  TO service_role;

-- 내부 헬퍼 — 어떤 역할도 직접 못 부른다(호출은 SECURITY DEFINER 함수 안에서만)
REVOKE ALL ON FUNCTION write_ingestion_review_changes(uuid, jsonb, jsonb)
  FROM public, anon, authenticated, service_role;

-- 리뷰(사용자) 경로: RPC 안에서 멤버십 검증. 수동 재개는 운영자+사용자(기존 retry와 동일)
REVOKE ALL ON FUNCTION
  update_pending_ingestion(uuid, jsonb, jsonb),
  confirm_ingestion_review(uuid),
  retry_source_digestion(uuid)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION
  update_pending_ingestion(uuid, jsonb, jsonb),
  confirm_ingestion_review(uuid),
  retry_source_digestion(uuid)
  TO authenticated, service_role;

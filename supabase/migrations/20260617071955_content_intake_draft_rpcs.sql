-- =============================================================
-- content-intake 3/3: 초안 RPC — create / update / delete / confirm
-- 직접 쓰기는 RLS로 막혀 있으므로(SELECT-only) 쓰기는 RPC 경유.
-- 확정(confirm_draft)은 기존 create_source를 그대로 호출해 엔진 트리거를 재사용한다.
-- =============================================================

-- ----- 생성 (앱 어시스턴트 결과 / MCP 새 초안) -----
CREATE OR REPLACE FUNCTION create_draft(
  p_space_id        uuid,
  p_origin          draft_origin,
  p_body            text,
  p_title           text   DEFAULT NULL,
  p_proposed_topics text[] DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', p_space_id;
  END IF;

  INSERT INTO drafts (space_id, author_id, origin, title, body, proposed_topics)
  VALUES (p_space_id, auth.uid(), p_origin, p_title,
          coalesce(p_body, ''), coalesce(p_proposed_topics, '{}'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 공동 편집 (사람 수정 / MCP 기존 초안 지목). 부분 갱신: NULL 인자는 기존값 유지 -----
CREATE OR REPLACE FUNCTION update_draft(
  p_draft_id        uuid,
  p_title           text   DEFAULT NULL,
  p_body            text   DEFAULT NULL,
  p_proposed_topics text[] DEFAULT NULL
)
RETURNS void AS $$
DECLARE v_space_id uuid;
BEGIN
  SELECT space_id INTO v_space_id FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft % not found', p_draft_id;
  END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller cannot access draft %', p_draft_id;
  END IF;

  UPDATE drafts SET
    title           = coalesce(p_title, title),
    body            = coalesce(p_body, body),
    proposed_topics = coalesce(p_proposed_topics, proposed_topics)
  WHERE id = p_draft_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 폐기 (멱등) -----
CREATE OR REPLACE FUNCTION delete_draft(p_draft_id uuid)
RETURNS void AS $$
DECLARE v_space_id uuid;
BEGIN
  SELECT space_id INTO v_space_id FROM drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller cannot access draft %', p_draft_id;
  END IF;

  DELETE FROM drafts WHERE id = p_draft_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ----- 확정 게이트 -----
-- 엔진 트리거(create_source) 재사용 + 제목/주제 연결 + 초안 제거를 한 트랜잭션으로.
-- 원문 작성자(sources.author_id) = 확정자(auth.uid()) = 사람 주권. drafts.author_id는
-- 출처 보존용이며 이 슬라이스에선 안 읽는다(멀티 유저 때 외부 작성자 추적에 쓸 자리).
-- 주제는 0개 허용(무태그 = 미분류). 강제하지 않는다(확신 없을 때 틀린 라벨 방지).
CREATE OR REPLACE FUNCTION confirm_draft(
  p_draft_id uuid,
  p_title    text,
  p_topics   text[]
)
RETURNS uuid AS $$
DECLARE
  v_space_id  uuid;
  v_body      text;
  v_source_id uuid;
  v_topic     text;
  v_topic_id  uuid;
BEGIN
  SELECT space_id, body INTO v_space_id, v_body
  FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft % not found', p_draft_id;
  END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', v_space_id;
  END IF;
  IF v_body IS NULL OR btrim(v_body) = '' THEN
    RAISE EXCEPTION 'draft body must be non-empty to confirm';
  END IF;

  -- 엔진 트리거 재사용: source 박제(extraction_status='pending') + 워커 notify
  v_source_id := create_source(v_space_id, v_body, NULL);

  UPDATE sources SET title = p_title WHERE id = v_source_id;

  -- 주제 레지스트리 find-or-create + 연결. p_topics가 비면 루프 미실행 = 무태그(미분류).
  FOREACH v_topic IN ARRAY coalesce(p_topics, '{}')
  LOOP
    CONTINUE WHEN btrim(v_topic) = '';
    -- DO UPDATE는 충돌 시 RETURNING을 켜는 관용구(기존 주제 재사용도 id 반환).
    -- 부수효과: 재사용 때마다 topics.updated_at 갱신 = "마지막 태깅" 시각(의도됨).
    INSERT INTO topics (space_id, name)
    VALUES (v_space_id, btrim(v_topic))
    ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_topic_id;

    INSERT INTO source_topics (source_id, topic_id)
    VALUES (v_source_id, v_topic_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  DELETE FROM drafts WHERE id = p_draft_id;

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- =============================================================
-- Permissions — 사용자 경로(RPC 안에서 멤버십 검증). MCP 서버도 사용자 토큰으로 authenticated.
-- 시그니처를 명시한다(하우스 스타일 + 오버로드 모호성 차단).
-- =============================================================

REVOKE ALL ON FUNCTION
  create_draft(uuid, draft_origin, text, text, text[]),
  update_draft(uuid, text, text, text[]),
  delete_draft(uuid),
  confirm_draft(uuid, text, text[])
  FROM public, anon;

GRANT EXECUTE ON FUNCTION
  create_draft(uuid, draft_origin, text, text, text[]),
  update_draft(uuid, text, text, text[]),
  delete_draft(uuid),
  confirm_draft(uuid, text, text[])
  TO authenticated, service_role;

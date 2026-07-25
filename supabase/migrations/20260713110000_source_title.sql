-- =============================================================
-- Source 제목 (product-decisions-log #15)
--
-- Source엔 제목이 있지만 사람이 작성 시 넣지 않는다 — 컴포저는 raw 붙여넣기만.
-- 채움은 (a) 이번 슬라이스: 인제스천 시 LLM이 채움(별도 콜 없이 기존 digest 생성
-- 콜 출력에 최상위 필드로 얹음), (b) 후속: 외부 연동(Slack·Tiro) 메타데이터.
-- 편집은 "평범한 대기 상태"(pending + 인제스천 중 아님)에서만 — 처리 중엔
-- source_digestion_cancel의 다른 초안 액션들과 같은 이유로 잠긴다.
--
-- DB 레벨 길이 제약은 안 둔다 — digests.title도 NOT NULL text뿐이고 길이는
-- app(zod) 레이어가 강제하는 게 기존 관용구(digest-review.ts:
-- DIGEST_TITLE_MAX_LENGTH).
--
-- sources.title 컬럼 자체는 이미 있다(20260617071953, v1 content-intake 시절
-- "확정 시 초안 제목이 넘어옴" 용도) — drop_draft_intake가 그 파이프라인을
-- 걷어내며 컬럼만 죽은 채 남았다(추출 워커도 안 읽음, 어떤 코드도 안 씀).
-- nullable text로 모양이 이번 용도와 그대로 맞아 새 컬럼을 더하지 않고 이걸
-- 재사용한다.
-- =============================================================

-- =============================================================
-- 1.5) sources.title_edited — 사람이 손댄 제목인지 표시
--
--      유저가 제목을 직접 고친 뒤 "추출 실행"으로 재인제스천을 돌리면(cancelled·
--      failed·empty 모두 재시도 경로가 있다) 워커가 새로 뽑은 sourceTitle이 그
--      수동 편집을 무음으로 덮어썼다 — 두 쓰기 다 title 컬럼 하나를 무조건
--      갱신해서 "이게 사람이 정한 값인지"를 구분할 수 없었다. update_source_title이
--      true로 세워두면 이후 워커의 완료 RPC들이 title 갱신을 건너뛴다.
-- =============================================================

ALTER TABLE sources ADD COLUMN title_edited boolean NOT NULL DEFAULT false;

-- =============================================================
-- 2) complete_source_digestion / create_ingestion_review — 제목 저장 반영
--
--    둘 다 digestion.ts의 같은 LLM 콜(generateStructured) 출력에서 나온
--    sourceTitle을 함께 받는다. 판단 없는 글(빈 digests)도 요약형 제목은
--    나오므로 두 경로 모두 채운다 — 단 title_edited면 사람이 이미 정한 값을
--    지키고 엔진 제목은 버린다.
-- =============================================================

DROP FUNCTION complete_source_digestion(uuid);

CREATE FUNCTION complete_source_digestion(p_source_id uuid, p_title text)
RETURNS void AS $$
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL,
      title            = CASE WHEN title_edited THEN title ELSE p_title END
  WHERE id = p_source_id AND digestion_status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP FUNCTION create_ingestion_review(uuid, jsonb, jsonb);

CREATE FUNCTION create_ingestion_review(
  p_source_id      uuid,
  p_digests        jsonb,
  p_title          text,
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
      error_message    = NULL,
      title            = CASE WHEN title_edited THEN title ELSE p_title END
  WHERE id = p_source_id AND digestion_status = 'pending' AND status = 'pending'
  RETURNING space_id, author_id INTO v_space_id, v_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;

  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — use complete_source_digestion for empty results';
  END IF;

  -- author_id = 원문 제공자: ingestion은 사람 주도 변경셋(07-modeling authorId 규칙)
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) update_source_title — 케이스 "초안에서 Source 제목 편집"
--
--    trash_source/cancel_source_digestion과 같은 가드 패턴: pending(평범한 대기)
--    + digestion_status <> 'pending'(처리 중 아님)일 때만. 처리 중 편집을 막는
--    이유는 "처리 중 상태에서 액션 잠금" 케이스와 같다 — 워커가 같은 행을 곧
--    title로 덮어쓸 수 있어 두 쓰기가 경합한다.
--
--    title_edited를 true로 세운다 — 이후 재인제스천이 이 제목을 사람이 정한
--    값으로 알고 건드리지 않는다.
-- =============================================================

CREATE FUNCTION update_source_title(p_source_id uuid, p_title text)
RETURNS void AS $$
BEGIN
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must be a non-empty text';
  END IF;

  UPDATE sources
  SET title = btrim(p_title),
      title_edited = true
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can retitle', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION
  complete_source_digestion(uuid, text),
  create_ingestion_review(uuid, jsonb, text, jsonb)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  complete_source_digestion(uuid, text),
  create_ingestion_review(uuid, jsonb, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION update_source_title(uuid, text) FROM public, anon;

GRANT EXECUTE ON FUNCTION update_source_title(uuid, text) TO authenticated, service_role;

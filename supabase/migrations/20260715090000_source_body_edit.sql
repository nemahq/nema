-- =============================================================
-- Source 원문(body) 편집 + 제목 생성 분리
--
-- 배경: "결과없음(empty)"에서 재추출을 눌러봐야 원문이 그대로면 같은 결과가 또
-- 나올 뿐이다. 재추출이 의미를 가지려면 그 전에 원문을 고칠 수 있어야 한다.
--
-- 이 김에 제목 생성 방식도 갈아엎는다. 지금 title은 digestion.ts의 무거운 생성
-- 콜(원문 전체 분석, standard 티어) 출력에 얹혀 나오는데, 제목은 Digest 추출
-- 결과에 의존하지 않는다 — ChatGPT 사이드바 제목이 응답 완료를 안 기다리고 첫
-- 메시지만 보고 뽑히는 것과 같다. 그래서 제목은 Source 생성 시점의 별도 콜
-- (body만 입력, nano 티어)로 떼어내고, 이 RPC들에서 title을 완전히 걷어낸다.
--
-- 그러면 title_edited도 필요 없다. 이 플래그는 "누가 title을 채웠나(사람/LLM)"를
-- 구분했지만, 제목 생성이 평생 딱 한 번(생성 시점)만 시도되는 지금은 "이미
-- 채워진 적 있나"만 보면 충분하다 — 즉 `title IS NULL` 하나로 족하다. 재추출·
-- body 편집 어느 트리거도 제목을 다시 건드리지 않으므로, LLM이 사람의 편집을
-- 덮어쓸 창 자체가 사라진다.
-- =============================================================

-- =============================================================
-- 1) complete_source_digestion / create_ingestion_review — title 결합 해제
--
--    둘 다 p_title을 받아 sources.title을 함께 갱신했다(20260713110000). 제목이
--    별도 콜로 떨어져 나가면서 이 RPC들은 title과 무관해진다 — 파라미터도 UPDATE
--    대상에서도 뺀다.
-- =============================================================

DROP FUNCTION complete_source_digestion(uuid, text);

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

DROP FUNCTION create_ingestion_review(uuid, jsonb, text, jsonb);

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

  -- author_id = 원문 제공자: ingestion은 사람 주도 변경셋(07-modeling authorId 규칙)
  INSERT INTO changesets (space_id, type, status, source_id, author_id)
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id, v_author_id)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 2) fill_source_title — 제목 생성 콜의 착지점
--
--    `title IS NULL`이 유일한 가드다. 그래서 이 함수는 한 번 채워진 제목을 구조적
--    으로 덮어쓸 수 없다 — 사람이 먼저 편집했든(update_source_title) 앞선 콜이 이미
--    채웠든, 두 번째 쓰기는 조용히 아무것도 안 한다.
--
--    NOT FOUND에 예외를 안 던지는 게 update_source_title과 갈리는 지점이다. 사람의
--    편집은 "안 먹었으면 알려줘야 하는" 액션이지만, 제목 채우기는 최선노력 부수효과라
--    이미 채워져 있으면 그게 정상 종료다. 여기서 예외를 던지면 정상 경쟁(사람이 생성
--    직후 제목을 먼저 고침)이 Sentry 알림으로 둔갑한다.
--
--    대가는 무음 no-op가 둘로 갈린다는 것이다: title이 이미 찬 경우(정상)와 호출자가
--    Space 멤버가 아닌 경우(비정상)가 같은 "아무 일도 안 일어남"으로 끝난다. 후자는
--    지금 호출부 구조상 도달할 수 없다 — 이 함수는 방금 자기가 만든 원문에만 붙고,
--    create_source가 이미 같은 멤버십을 검증했다. 멤버십 검사는 호출부가 바뀌었을 때를
--    위한 backstop이지 여기서 구분해 보고할 신호가 아니다.
--
--    상태 가드(pending·처리 중 아님)는 안 건다. 이 콜은 생성 직후 떠서 디제스천이
--    도는 중에 착지할 수 있고, title은 디제스천이 더는 안 건드리는 컬럼이라 경합이
--    없다 — 처리 중 잠금은 워커와 같은 컬럼을 다툴 때만 필요한 제약이다.
-- =============================================================

CREATE FUNCTION fill_source_title(p_source_id uuid, p_title text)
RETURNS void AS $$
BEGIN
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must be a non-empty text';
  END IF;

  UPDATE sources
  SET title = btrim(p_title)
  WHERE id = p_source_id
    AND title IS NULL
    AND (auth.uid() IS NULL OR is_space_member(space_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- 3) update_source_title — title_edited 쓰기 제거
--
--    가드는 그대로(평범한 대기 상태에서만). 플래그를 세울 이유가 사라졌을 뿐이다 —
--    사람이 제목을 채운 순간 title이 NOT NULL이 되고, fill_source_title의 null
--    가드가 그 값을 지킨다.
-- =============================================================

CREATE OR REPLACE FUNCTION update_source_title(p_source_id uuid, p_title text)
RETURNS void AS $$
BEGIN
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'p_title must be a non-empty text';
  END IF;

  UPDATE sources
  SET title = btrim(p_title)
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

ALTER TABLE sources DROP COLUMN title_edited;

-- =============================================================
-- 4) update_source_body — 케이스 "재추출 전에 원문 고치기"
--
--    update_source_title의 가드(pending + 처리 중 아님)에 "열린 리뷰 없음"을 하나
--    더 얹는다. 제목과 달리 body는 리뷰 대기 중인 Digest들이 뽑혀 나온 출처라,
--    리뷰가 열린 채로 원문을 갈아치우면 화면의 후보들이 더는 존재하지 않는 문장에서
--    나온 것이 된다. 리뷰를 먼저 확정하거나 버려야 원문을 고칠 수 있다.
--
--    그래서 열리는 자리는 넷이다: cancelled·failed·empty(판단이 안 나와 리뷰가 아예
--    안 열린 완료), 그리고 리뷰가 열렸다가 사람이 버린 경우(changeset이 pending에서
--    빠지므로 가드를 통과한다). 앞의 셋은 "뽑힌 게 없어" 되돌릴 것이 없고, 마지막은
--    "뽑혔지만 사람이 이미 버려서" 되돌릴 것이 없다 — 어느 쪽이든 지금 화면에 걸린
--    후보가 없다는 점이 같고, 가드가 지키려는 건 정확히 그것뿐이다.
--
--    body를 고쳐도 title은 그대로 둔다. 제목 생성은 평생 한 번(생성 시점)이고 그
--    뒤론 사람 책임이다 — 여기서 title을 NULL로 되돌리면 사람이 정한 제목이 다음
--    생성 콜에 덮이는, 방금 없앤 문제가 그대로 돌아온다.
-- =============================================================

CREATE FUNCTION update_source_body(p_source_id uuid, p_body text)
RETURNS void AS $$
BEGIN
  IF p_body IS NULL OR btrim(p_body) = '' THEN
    RAISE EXCEPTION 'p_body must be a non-empty text';
  END IF;

  UPDATE sources
  SET body = btrim(p_body)
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM changesets
      WHERE source_id = p_source_id
        AND type = 'ingestion'
        AND status = 'pending'
    )
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle draft the caller can rewrite', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =============================================================
-- Permissions
-- =============================================================

REVOKE ALL ON FUNCTION
  complete_source_digestion(uuid),
  create_ingestion_review(uuid, jsonb, jsonb)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  complete_source_digestion(uuid),
  create_ingestion_review(uuid, jsonb, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION
  fill_source_title(uuid, text),
  update_source_body(uuid, text)
  FROM public, anon;

GRANT EXECUTE ON FUNCTION
  fill_source_title(uuid, text),
  update_source_body(uuid, text)
  TO authenticated, service_role;

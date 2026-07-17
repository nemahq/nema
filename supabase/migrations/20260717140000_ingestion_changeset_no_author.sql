-- ingestion changeset의 author_id는 원래 07-modeling.md §authorId 규칙상 항상 null이어야
-- 한다 — changeset의 구체적 내용(Digest 분할·제목·Reference 후보)은 사람이 아니라
-- 엔진이 만들기 때문에 relation과 같은 엔진 산물로 취급한다. 근데 create_ingestion_review가
-- 여기에 Source 제출자 id를 그대로 넣고 있었다 — Source·Digest의 author_id(제출자 귀속)와
-- Changeset의 author_id(그 changeset 내용을 만든 주체)를 混동한 것으로, 리뷰 화면에서
-- ingestion·relation이 항상 "엔진 제안"으로 보여야 하는데 실제로는 제출자 이름이 뜨는
-- 버그였다. Source·Digest 레벨의 author_id(제출자 귀속)는 이미 올바르게 별도로 기록되고
-- 있어(confirm_ingestion_review가 Digest 생성 시 Source.author_id를 독립적으로 다시
-- 조회해 승계) 이 수정으로 잃는 정보가 없다.
DROP FUNCTION create_ingestion_review(uuid, jsonb, jsonb, jsonb);

CREATE FUNCTION create_ingestion_review(
  p_source_id         uuid,
  p_digests           jsonb,
  p_new_references    jsonb DEFAULT '[]'::jsonb,
  p_reference_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_space_id     uuid;
  v_changeset_id uuid;
BEGIN
  UPDATE sources
  SET digestion_status = 'completed',
      error_message    = NULL
  WHERE id = p_source_id AND digestion_status = 'pending' AND status = 'pending'
  RETURNING space_id INTO v_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not pending digestion', p_source_id;
  END IF;

  IF jsonb_array_length(coalesce(p_digests, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'p_digests must not be empty — use complete_source_digestion for empty results';
  END IF;

  INSERT INTO changesets (space_id, type, status, source_id)
  VALUES (v_space_id, 'ingestion', 'pending', p_source_id)
  RETURNING id INTO v_changeset_id;

  PERFORM write_ingestion_review_changes(v_changeset_id, p_digests, p_new_references, p_reference_updates);

  RETURN v_changeset_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION create_ingestion_review(uuid, jsonb, jsonb, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_ingestion_review(uuid, jsonb, jsonb, jsonb)
  TO service_role;

-- 이미 잘못 채워진 기존 ingestion changeset도 소급 정정 — 앞으로 만들어질 것만 고치면
-- 지금 리뷰 대기·리뷰됨 목록에 남아있는 과거 데이터는 계속 틀린 채로 보인다.
UPDATE changesets SET author_id = NULL WHERE type = 'ingestion' AND author_id IS NOT NULL;

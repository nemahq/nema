-- =============================================================
-- 비인용 신규 레퍼런스 필터 — 수동 확정 경로에도 워커와 같은 불변식 적용
--
-- 워커 경로(normalizeGeneratedDigests)는 "어떤 Digest도 인용하지 않는 신규
-- 레퍼런스 제안은 버린다"를 지키는데, 리뷰 편집(update_pending_ingestion) 경로는
-- p_new_references 전부를 적재해 고아 active 레퍼런스가 레지스트리에 남을 수
-- 있었다(사용자가 인용을 지우거나 그 digest를 삭제하고 확정하는 경우) — 이후
-- digestion 프롬프트를 오염시키는, 워커가 막으려던 바로 그 노이즈다.
-- 불변식을 데이터 경계(공통 몸통) 한 곳에 심어 tRPC·service_role 직접 호출
-- 모두 같은 규칙을 지나게 한다.
-- =============================================================

CREATE OR REPLACE FUNCTION write_ingestion_review_changes(
  p_changeset_id    uuid,
  p_digests         jsonb,
  p_new_references  jsonb
)
RETURNS void AS $$
DECLARE
  v_item       jsonb;
  v_cited_keys jsonb;
  v_key_ids    jsonb := '{}'::jsonb;
  v_ref_id     uuid;
  v_digest_id  uuid;
  v_ref_ids    jsonb;
BEGIN
  -- 인용된 key 집합 — 여기 없는 신규 레퍼런스 제안은 적재하지 않는다
  SELECT coalesce(jsonb_agg(DISTINCT cited.key), '[]'::jsonb) INTO v_cited_keys
  FROM jsonb_array_elements(coalesce(p_digests, '[]'::jsonb)) AS digest(value),
       jsonb_array_elements_text(coalesce(digest.value->'new_reference_keys', '[]'::jsonb)) AS cited(key);

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(p_new_references, '[]'::jsonb))
  LOOP
    CONTINUE WHEN NOT (v_cited_keys ? (v_item->>'key'));
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

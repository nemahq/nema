-- NEM-86 후속: fan-out 저장 원자화.
-- 기존 apps/server는 아이템별로 create_memory_with_revision / update_memory_with_revision RPC를
-- 순차 호출했고, 중간 실패 시 이미 반영된 Memory·Revision이 orphan으로 남았다.
-- 단일 RPC로 모든 아이템을 한 트랜잭션 내에서 처리해 all-or-nothing 으로 만든다.

CREATE OR REPLACE FUNCTION apply_save_pipeline(
  p_user_id    uuid,
  p_history_id uuid,
  p_items      jsonb
)
RETURNS text[] AS $$
DECLARE
  v_item   jsonb;
  v_titles text[] := '{}';
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'user_id mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM histories WHERE id = p_history_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'history not found or not owned by user';
  END IF;

  IF jsonb_typeof(p_items) != 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF v_item->>'update_type' = 'create' THEN
      PERFORM create_memory_with_revision(
        p_user_id,
        p_history_id,
        v_item->>'title',
        v_item->>'category',
        ARRAY(SELECT jsonb_array_elements_text(v_item->'tags')),
        v_item->>'summary',
        v_item->>'body'
      );
    ELSE
      IF v_item->>'target_id' IS NULL THEN
        RAISE EXCEPTION 'update_type "%" requires non-null target_id', v_item->>'update_type';
      END IF;
      PERFORM update_memory_with_revision(
        (v_item->>'target_id')::uuid,
        p_user_id,
        p_history_id,
        v_item->>'title',
        v_item->>'category',
        ARRAY(SELECT jsonb_array_elements_text(v_item->'tags')),
        v_item->>'summary',
        v_item->>'body',
        (v_item->>'update_type')::update_type
      );
    END IF;

    v_titles := v_titles || (v_item->>'title');
  END LOOP;

  RETURN v_titles;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

REVOKE ALL ON FUNCTION apply_save_pipeline(uuid, uuid, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION apply_save_pipeline(uuid, uuid, jsonb) TO authenticated;

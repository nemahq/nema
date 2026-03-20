-- #1 getExistingTags를 DB에서 바로 유니크 태그만 반환하도록 변경
CREATE OR REPLACE FUNCTION get_unique_tags(p_user_id uuid)
RETURNS text[] AS $$
  SELECT coalesce(array_agg(DISTINCT t), '{}')
  FROM documents, unnest(tags) AS t
  WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE;

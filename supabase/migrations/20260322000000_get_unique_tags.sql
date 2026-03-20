-- #1 getExistingTags를 DB에서 바로 유니크 태그만 반환하도록 변경
CREATE OR REPLACE FUNCTION get_unique_tags(p_user_id uuid)
RETURNS text[] AS $$
  SELECT coalesce(array_agg(DISTINCT t) FILTER (WHERE t IS NOT NULL), '{}')
  FROM documents, unnest(tags) AS t
  WHERE user_id = p_user_id;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION get_unique_tags FROM public, anon;
GRANT EXECUTE ON FUNCTION get_unique_tags TO authenticated;

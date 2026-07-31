-- 태그 색상 체계 개편(#541, 20260731100000_tag_color_sienna.sql)이 tags 테이블
-- enum 값만 slate→sienna로 바꿨다(ALTER TYPE ... RENAME VALUE). changesets.label_draft
-- (리뷰 레벨 태그 팔레트, 20260731110000_reference_existence_label_palette_draft_id_freeze.sql
-- 도입)는 jsonb라 그 RENAME VALUE의 영향을 안 받고, 그 마이그레이션이 changes.data의
-- 옛 tags[].color 값을 label_draft로 그대로(coalesce) 옮기면서 "slate"도 변환 없이
-- 함께 옮겨졌다. StoredLabelDraftSchema(digest-review-service.ts)가 이 값을
-- TagColorSchema로 엄격 검증해 digestReview.get이 ZodError로 500을 내던 버그의
-- 데이터 쪽 원인 — 여기서 남은 값을 백필해 근본 해결한다. status·changeset type
-- 무관하게 label_draft가 있는 모든 행을 대상으로 한다(이미 닫힌 기록도 되돌리기
-- 재판정 화면이 다시 읽을 수 있으므로).
UPDATE changesets
SET label_draft = label_draft || jsonb_build_object(
  'tags', (
    SELECT coalesce(jsonb_agg(
      CASE WHEN t.value->>'color' = 'slate'
        THEN t.value || jsonb_build_object('color', 'sienna')
        ELSE t.value
      END ORDER BY t.ord
    ), '[]'::jsonb)
    FROM jsonb_array_elements(coalesce(label_draft->'tags', '[]'::jsonb))
      WITH ORDINALITY AS t(value, ord)
  )
)
WHERE label_draft IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(label_draft->'tags', '[]'::jsonb)) AS tag
    WHERE tag->>'color' = 'slate'
  );

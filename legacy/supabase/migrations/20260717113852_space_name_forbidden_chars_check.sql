-- =============================================================
-- Space 이름 DB 레벨 방어 — 비가시/위장 문자 차단 + 길이 제한
--
-- create_space/rename_space는 GRANT EXECUTE ... TO authenticated로
-- PostgREST(/rest/v1/rpc/...)를 통해 직접 호출 가능해서, 지금까지 앱
-- 레이어(zod, packages/shared/src/schemas/space.ts)의 검증만으로는
-- tRPC를 거치지 않는 호출을 막지 못했다. 이 CHECK를 추가해 zod와
-- 동일한 문자 판정을 DB 레벨에서도 강제한다 — 두 곳의 정규식이 서로
-- 어긋나면 한쪽만 통과하는 이름이 생기므로, 이 패턴을 바꿀 때는
-- packages/shared/src/schemas/space.ts의 SPACE_NAME_FORBIDDEN_CHARS_PATTERN도
-- 함께 맞춰야 한다.
--
-- CHECK 추가 전, 이미 저장된 이름 중 위반하는 행이 있으면(있을 가능성은
-- 낮지만) 위반 문자를 제거하고 50자로 자른다 — 전부 제거돼 빈 문자열이
-- 되면 기본 이름("My space")으로 대체한다. 아래 50은
-- packages/shared/src/schemas/space.ts의 SPACE_NAME_MAX_LENGTH와 같은 값 —
-- 그 상수를 바꾸면 이 파일의 50도 함께 맞춰야 한다.
-- =============================================================

UPDATE spaces
SET name = CASE
  WHEN btrim(regexp_replace(name, '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u3164\uFFA0\U000E0000-\U000E007F]', '', 'g')) = ''
    THEN 'My space'
  ELSE left(btrim(regexp_replace(name, '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u3164\uFFA0\U000E0000-\U000E007F]', '', 'g')), 50)
END
WHERE name ~ '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u3164\uFFA0\U000E0000-\U000E007F]' OR char_length(name) > 50;

-- 50 = SPACE_NAME_MAX_LENGTH(packages/shared/src/schemas/space.ts)
ALTER TABLE spaces
  ADD CONSTRAINT spaces_name_max_length CHECK (char_length(name) <= 50);

ALTER TABLE spaces
  ADD CONSTRAINT spaces_name_no_forbidden_chars CHECK (name !~ '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u3164\uFFA0\U000E0000-\U000E007F]');

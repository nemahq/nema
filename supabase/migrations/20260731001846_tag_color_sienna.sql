-- slate는 이름과 달리 실제로는 파란기가 도는 색이었고(파스텔 축소판인 cyan과
-- hue가 20°밖에 안 떨어져 육안 구분도 약했다), 그 슬롯을 채도 낮은 갈색(sienna)으로
-- 바꾼다. 값 목록 나머지는 그대로라 RENAME VALUE로 충분하다(changeset_status처럼
-- 값 집합 전체가 바뀌는 경우에만 타입을 통째로 새로 만드는 방식이 필요하다 —
-- 20260726075454_changeset_status_outcome.sql 참고). 기존 tags.color='slate' 행은
-- 이 한 문장으로 전부 'sienna'가 된다.
ALTER TYPE tag_color RENAME VALUE 'slate' TO 'sienna';

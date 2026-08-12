-- =============================================================
-- 시간 질의 재배치 (temporal-query-design 7장): 내용 속 기한 저장
--
-- statements.due_date     — 진술 내용의 기한("이번 주 금요일까지")을 작성 시점 존 기준으로
--                           정규화해 박은 절대 날짜. 기한 없는 진술이 대부분이라 null이 기본.
-- sources.author_timezone — 기한 정규화의 기준 존(작성자 IANA 존, 예: "Asia/Seoul").
--                           "금요일"은 글 쓴 사람의 그 시점 존 기준이라 글마다 박는다.
--                           글 받을 때 클라이언트가 채우고, 비면 추출이 기본 존으로 강등한다.
-- =============================================================

ALTER TABLE statements ADD COLUMN due_date date;

-- 기한 걸린 진술만 색인 — 대부분 null이라 부분 색인으로 작게. "이번 주 마감" 질의의 날짜 필터용.
CREATE INDEX idx_statements_space_due
  ON statements (space_id, due_date)
  WHERE due_date IS NOT NULL;

ALTER TABLE sources ADD COLUMN author_timezone text;

-- =============================================================
-- trash_source — 열린 ingestion changeset 가드 추가
--
-- 문제: 벌크 삭제는 sourceId마다 trash_source를 개별 호출하며 동시성 10으로 배치
-- 처리한다(deleteSources). 요청 전송 시점엔 초안이 "정리 중"(digestion_status=
-- 'pending')이라 대상에서 빠졌더라도, 실제 실행 사이 워커가 create_ingestion_review로
-- 정리를 끝내고(digestion_status→'completed' + changeset 생성, 한 트랜잭션) 나면
-- digestion_status<>'pending' 가드를 통과해버려 방금 리뷰가 열린 소스가 그대로
-- trashed된다 — changeset은 그대로 남아 고아가 되고 확인 대기 카운트가 어긋난다.
--
-- 해법: 같은 "그 사이 상태가 바뀜"(NM004) 계열인 reassign_source_space·
-- start_source_digestion·pending_draft_source_ids가 이미 갖는 "열린 ingestion
-- changeset 없음" 가드를 trash_source에도 동일하게 더한다. 열려 있으면 다른 액션과
-- 같은 취급(NM004)이라 벌크 삭제 쪽 동시성 충돌 처리(isSourceStateConflict)가 그대로
-- 이 경우를 흡수한다 — 서버 코드 변경 불필요.
-- =============================================================

CREATE OR REPLACE FUNCTION trash_source(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id AND c.type = 'ingestion' AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM004';
  END IF;

  -- 삭제는 pending에서만 — active 원문은 되돌리기로 pending을 거쳐야 한다
  UPDATE sources
  SET status = 'trashed', trashed_at = now()
  WHERE id = p_source_id
    AND status = 'pending'
    AND digestion_status <> 'pending'
    AND (auth.uid() IS NULL OR is_space_member(space_id));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'source % is not an idle pending source the caller can trash', p_source_id
      USING ERRCODE = 'NM004';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

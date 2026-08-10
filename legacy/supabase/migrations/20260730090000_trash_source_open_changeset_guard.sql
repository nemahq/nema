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
-- 해법: 같은 "그 사이 상태가 바뀜" 계열인 reassign_source_space·start_source_digestion·
-- pending_draft_source_ids가 이미 갖는 "열린 ingestion changeset 없음" 가드를
-- trash_source에도 동일하게 더한다. 다만 이 경우는 NM004("새로고침하면 됨")가 아니라
-- 새 코드 NM014를 쓴다 — 리뷰를 먼저 확인해야만 풀리는 상태라 재시도 안내가 안 맞기
-- 때문(NM011/NM013을 가른 이유와 동일, supabase-error.ts 참고). 그래서 이 변경은
-- deleteSources의 동시성 충돌 분류(isSourceStateConflict)와 error-mapper·i18n에도
-- NM014 처리를 더해야 했다 — SQL만으로 안 끝난다.
--
-- 한계: EXISTS 확인과 UPDATE가 한 문장이 아니라, 그 사이 극히 짧은 창에 워커의
-- create_ingestion_review가 끼어들면(EXISTS 통과 직후 커밋) 여전히 놓칠 수 있다.
-- 형제 가드들도 같은 모양(EXISTS 뒤 별도 UPDATE)이라 이 PR에서 새로 생긴 한계는
-- 아니다 — 레이스를 없앤 게 아니라 창을 batch 처리 전체 구간에서 한 문장 간격으로
-- 좁힌 것으로 이해해야 한다.
-- =============================================================

CREATE OR REPLACE FUNCTION trash_source(p_source_id uuid)
RETURNS void AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM changesets c
    WHERE c.source_id = p_source_id AND c.type = 'ingestion' AND c.status = 'open'
  ) THEN
    RAISE EXCEPTION 'source % already has a review awaiting confirmation', p_source_id
      USING ERRCODE = 'NM014';
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

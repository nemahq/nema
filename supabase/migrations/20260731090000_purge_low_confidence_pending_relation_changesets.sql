-- =============================================================
-- 저확신 supports/replaces/resolves pending relation changeset 정리
--
-- 문제: gateProposals(worker.ts)가 conflicts·duplicates가 아닌 관계 제안 중 애매한
-- (confident=false) 것도 pending으로 올리던 버그가 있었다 — 정책상 사람 확인은
-- conflicts·duplicates에만 필요하고, 그 외 애매한 제안은 조용히 버려야 맞다
-- (review-flow.md "판정 대기 relation changeset 생성" D7 결정, relation-design.md §5).
-- 그 결과 이미 만들어진 이 pending changeset들은 죽은 자리다 — getPendingRelationByNumber가
-- conflicts·duplicates만 처리해, 목록엔 "리뷰 대기중"으로 뜨지만 열면 not_found로
-- 터진다. gateProposals는 이번 마이그레이션과 같은 슬라이스에서 이미 고쳤다(더는
-- 이런 행이 새로 생기지 않음) — 이 마이그레이션은 과거에 이미 생성된 행만 청소한다.
--
-- 안전성: 아직 open이라 statement_relations엔 아무것도 안 쓰여 있다(관계 행은
-- closed+applied 전환 시점에만 생긴다 — apply_relation_changesets). changes 행은
-- changesets.id FK의 ON DELETE CASCADE로 같이 지워진다. 이 open 행들을 "다른
-- changeset이 가리키는" 두 경로도 막혀 있다: ① invalidated_by_id — 다른 changeset이
-- 이 값으로 이 행을 가리키려면 이 행이 그 invalidate 호출의 p_invalidated_by여야
-- 하는데, invalidate_stale_relation_proposals를 부르는 자리(resolve_conflict_relation·
-- resolve_duplicate_relation)는 전부 그 직후 자기 자신을 곧바로 closed+applied로
-- 닫는 changeset이 호출자다 — open인 이 행이 그 호출자가 될 일이 없다. ② reverts_id —
-- changesets.reverts_id는 ON DELETE CASCADE라 참조가 있었다면 그 참조 행도 같이
-- 지워지지만, revert_changeset은 대상 changeset의 status/outcome부터 검사해
-- status<>'closed' 또는 outcome<>'applied'면 그 자리에서 즉시 거부한다(20260729153926_
-- revert_policy_reopen_draft.sql revert_changeset 함수, "not closed+applied — nothing
-- to revert"). open인 이 행은 이 첫 검사에서 항상 걸려 되돌리기 시도 자체가 성립하지
-- 않으므로 reverts_id로 가리켜질 일이 없다 — 참조 무결성 걱정 없이 하드 삭제해도 된다.
-- =============================================================

DELETE FROM changesets
WHERE type = 'relation'
  AND status = 'open'
  AND EXISTS (
    SELECT 1
    FROM changes ch
    WHERE ch.changeset_id = changesets.id
      AND ch.target_type = 'relation'
      AND ch.data->>'type' IN ('supports', 'replaces', 'resolves')
  );

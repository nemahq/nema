-- =============================================================
-- 사람 개입 1/4: enum 값 추가 — rejected(거절) + restore(되살림)
--
-- intervention-design §5.2(거절)·§4(되돌리기 역연산). 두 값을 쓰는
-- 모든 것(chk_data_by_action 수정·조작 RPC)과 반드시 별도 마이그레이션이다 —
-- ALTER TYPE ... ADD VALUE로 더한 값은 같은 트랜잭션에서 참조할 수 없다
-- (Postgres "unsafe use of new value"). 관계 엔진의 'relation' 값이 겪은 선례
-- (20260614072229 ↔ 20260614072230)와 같은 분리(intervention-design §8 D).
-- =============================================================

-- 거절: pending 관계 제안의 terminal 상태(applied와 대칭). 거절된 제안은
-- 행으로 남아 "엔진 제안 → 사람 거절" 흔적이 되고, 재제안 가드(4/4)가 본다.
ALTER TYPE changeset_status ADD VALUE IF NOT EXISTS 'rejected';

-- 되살림: archived→active 복귀. archive의 대칭이라 되돌리기/redo가 역연산표
-- 하나(create→archive, archive→restore, restore→archive)로 닫히고, 이력이
-- "되돌리기: S2 되살림"으로 자기 기술적으로 읽힌다(intervention-design §4).
ALTER TYPE change_action ADD VALUE IF NOT EXISTS 'restore';

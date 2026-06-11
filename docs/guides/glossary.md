# 용어 사전

제품 용어(사용자에게 노출)와 코드 용어(내부 구현)의 매핑.

## 대화 계층

| 제품 용어 (한) | 제품 용어 (영) | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | ---- |
| 맥락 | Context | Session | 사용자와 AI 간의 대화 공간 |
| 메시지 | Message | Message | 세션 내 개별 대화 단위 |
| 챗 | Chat | Chat | 사용자 메시지에 대한 AI 응답 생성 프로세스 (한 턴) |
| 초안 | Draft | Draft | AI가 구조화한 저장 전 중간 결과물 |

## 지식 계층 (진술 엔진)

| 제품 용어 (한) | 제품 용어 (영) | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | ---- |
| 진술 | Statement | `statements` | 맥락의 최소 단위 — '왜'를 담은 문장 한 조각 (claim/question/todo) |
| 원본 | Source | `sources` | 진술이 추출된 원재료. 무손실 박제되며 진술이 가리킨다 |
| 관계 | Relation | `statement_relations` | 진술을 잇는 선 (supports/conflicts/replaces/resolves) |
| 변경셋 | Changeset | `changesets` / `changes` | 한 번의 변경 묶음 — 리뷰·되돌리기·이력의 단위 |
| 스페이스 | Space | `spaces` / `space_members` | 기록의 소유 칸. 개인=팀, 멤버 수만 다르다 |

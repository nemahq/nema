# 모델링

## Source

시스템이 손대지 않고, 사람이 작성한 그대로 박제하는 원재료. 의미로 다뤄지지 않는다. Digest가 여기서 만들어진다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `spaceId` | `uuid` | 어느 Space에 제출됐나 |
| `body` | `string` | 원문 텍스트 (타이핑·붙여넣기·전사·추출 텍스트) |
| `createdAt` | `Date` | 원본이 시스템에 들어온 때 |
| `status` | `enum: pending / active / trashed` | 존재 상태. `pending`은 파생된 게 없는 상태(갓 생성됐거나, 원본 빼기로 되돌려진 것 — "처리 중인 Source 작업 목록"에 노출). `active`는 확정된 Digest·Statement 등이 있는 상태. `trashed`는 사용자가 명시적으로 삭제를 선택한 상태 — `trashedAt` 이후 보관 기간(30일)이 지나면 배치로 완전 삭제됨. 전이는 한 방향 사슬 `active →(빼기)→ pending →(삭제)→ trashed`이고 복원은 `trashed → pending`(파생 없는 상태라 pending 정의 그대로) — active에서 파생을 유지한 채 원본만 치우는 동작은 없다. 삭제·복원(pending↔trashed)은 변경이력에 남기지 않는다 — pending 원본은 그래프에 아무것도 심지 않아 리뷰·되돌리기의 대상이 아니다 |
| `trashedAt?` | `Date` | `trashed`가 된 시각 — 완전 삭제 배치가 보관 기간 경과 여부를 판단하는 기준 |
| `authorId?` | `uuid` | 누가 넣었나 (사용자 id) — User 삭제 시 `ON DELETE SET NULL`이라 nullable |

## Digest

Source를 사람이 읽기 좋게 정리한 것. 여기서 Statement가 추출된다.

| key | 타입 | 설명 |
|---|---|---|
| `sourceId` | `uuid` | 어느 Source에서 나왔나. Source 1개가 여러 Digest를 낳을 수 있음(한 뭉치 안에 여러 판단 유형이 섞여 있으면 유형별로 쪼개짐). 새 Source는 새 Digest를 만들 뿐 기존 Digest를 안 건드림 |
| `spaceId` | `uuid` | 소속 Space — `sourceId`로 유추 가능하지만, Space 오버뷰의 메인 피드(Topic별 Digest 피드)가 이 값으로 직접 조회하므로 따로 둠 |
| `locator?` | `Locator` | Source 안에서 이 Digest가 나온 위치 (선택 — `body`의 문자 범위 등). 평소엔 Digest 자체로 판정하고, 원문 대조가 필요할 때만 씀 |
| `title` | `string` | 제목 — 헤드라인처럼 짧게 |
| `description` | `string` | 한 줄 요약 — 피드에서 title 다음으로 보이는 미리보기 |
| `body` | `DigestBody` | 정리된 내용, 타입별로 다른 구조 (아래) |
| `topicIds?` | `uuid[]` | Topic (Space 안에서 재사용) |
| `tagIds?` | `uuid[]` | Tag (Workspace 안에서 Space 가로질러 재사용) |
| `relatedDigestIds?` | `uuid[]` | 관련 Digest — 명시적으로 이어지는 다른 Digest들. Topic/Thread와 달리 의도적·정밀한 링크. 의미 관계(지지·충돌 등)가 아니라 느슨한 상호 참조라 방향 없음 |
| `referenceIds?` | `uuid[]` | 이 Digest가 언급하는 Reference들 (인물·조직·프로젝트·제품·개념) |
| `externalUrls?` | `string[]` | 정리 과정에서 원문에서 뽑아낸 외부 링크들 (Slack 메시지, Notion 페이지 등) |
| `authorId?` | `uuid` | 작성자(User) — User 삭제 시 `ON DELETE SET NULL`이라 nullable |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

### DigestBody

`type`에 따라 모양이 갈리는 판별 유니언. 모든 필드는 optional — 원문에 없으면 비워두고 지어내지 않는다.

**Decision** (`type: 'decision'`)

| key | 타입 | 설명 |
|---|---|---|
| `situation?` | `string` | 상황 — 무엇을 정해야 했는가 |
| `choice?` | `string` | 선택 — 무엇으로 정했는가 |
| `reason?` | `string` | 이유 — 왜 그렇게 골랐는가 |
| `tradeoff?` | `string[]` | 트레이드오프 — 감수한 것 |
| `alternatives?` | `string[]` | 대안 — 검토했지만 기각한 것 |

**Pending** (`type: 'pending'`)

| key | 타입 | 설명 |
|---|---|---|
| `question?` | `string` | 질문 — 아직 뭘 못 정했는가 |
| `background?` | `string` | 배경 — 왜 이 질문이 생겼는가 |
| `branches?` | `string[]` | 갈래 — 검토 중인 후보들 |
| `resolutionCondition?` | `string` | 해소 조건 — 뭐가 확인되면 풀리는가 |

**Learning** (`type: 'learning'`)

| key | 타입 | 설명 |
|---|---|---|
| `finding?` | `string` | 발견 — 무엇을 확인했는가 |
| `evidence?` | `string` | 근거 — 무엇을 보고 그렇게 확인했는가 |

**Idea** (`type: 'idea'`)

| key | 타입 | 설명 |
|---|---|---|
| `concept?` | `string` | 발상 — 무슨 아이디어인가 |
| `background?` | `string` | 배경 — 왜 이 아이디어가 떠올랐는가 |
| `branches?` | `string[]` | 갈래 — 파생되는 후보들 |

**Assumption** (`type: 'assumption'`, 실사용 검증 없는 신규 타입)

| key | 타입 | 설명 |
|---|---|---|
| `assumption?` | `string` | 가정 내용 — 뭘 사실로 놓고 진행하는가 |
| `evidence?` | `string` | 근거 — 왜 그렇게 믿는가 (약해도 됨) |
| `impact?` | `string` | 영향 — 틀렸을 때 뭐가 바뀌는가 (맞았을 때는 원래 계획대로라 기록할 실익이 적음) |
| `verificationCondition?` | `string` | 검증 조건 — 뭘 보면 맞았는지 틀렸는지 알 수 있는가 |

## Statement

하나의 '왜'를 담은 문장 크기의 의미 한 조각. 맥락의 단위.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `content` | `string` | 진술 내용, 그 '왜' 자체 |
| `confidence?` | `enum: certain / guess` | 사실인가 추측인가 — `claim`에서만 (확장 가능) |
| `type` | `enum: claim / question / todo` | 진술의 종류 — 결정·미정 단언도 `claim` |
| `digestId` | `uuid` | 어느 Digest에서 추출됐나. Source가 아니라 Digest를 직접 참조 — 확정 후 안 바뀌는 Digest라 locator가 안정적이고, Digest는 이미 사람이 확정한 것이라 판정의 진짜 근거가 됨 |
| `referenceIds?` | `uuid[]` | 이 Statement가 실제로 언급하는 Reference들. `Digest.referenceIds`가 리뷰 단계의 후보군이라면, 이건 Statement 생성(2단계) 때 문장 단위로 정밀하게 매핑된 결과 — Reference 상세 화면의 역참조·해설 근거 인용이 이 정밀도를 요구한다 |
| `createdAt` | `Date` | 진술이 시스템에 들어온 때 |
| `status` | `enum: active / archived` | 존재 상태 — `replaces`·`duplicates`로 대체되거나, 소속 Digest·Source가 되돌려지면 연쇄로 `archived` |

## Relation

두 진술을 잇는 방향 있는 선. 진술과 동급의 단위이며, "무엇이 무엇을 지지·반박·대체하는지"의 그래프가 네마가 지키는 자산이다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `type` | `enum: supports / conflicts / replaces / duplicates / resolves` | 관계 종류 (인과·시간순·연관은 동작 갈리면 추가) |
| `fromId` | `uuid` | 출발 진술 (A) |
| `toId` | `uuid` | 도착 진술 (B) |
| `createdAt` | `Date` | 관계가 생긴 때 |
| `status` | `enum: active / archived` | 존재 상태 — 끝점 진술이 `archived`되면 연쇄로 `archived` |

**방향 의미**
- `supports` A→B: A가 B를 뒷받침한다 ("B인 이유는 A").
- `conflicts`: A와 B가 부딪힌다. 논리상 대칭이나 저장은 방향 있게 두고 동작에서 대칭으로 다룬다.
- `replaces` A→B: A가 B를 밀어내 B가 지난 것이 된다. 진술의 폐기는 여기서 파생된다.
- `duplicates` A→B: A와 B가 같은 뜻이라 A만 남고 B가 지난 것이 된다. `replaces`와 폐기 메커니즘은 같지만, 사실이 바뀐 게 아니라 같은 말이 중복된 것이라는 원인이 달라 표식에서 다르게 설명된다. `conflicts`처럼 논리상 대칭이나 저장은 방향 있게 둔다.
- `resolves` A→B: A(답·완료)가 B(질문·할일)를 닫는다. 폐기와 달리 B는 틀린 게 아니라 해소된 것.

## Reference

Digest 틀에 안 맞지만 반복 참조되는 것을 위한 곳. 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이 다듬어진다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `workspaceId` | `uuid` | 재사용 스코프 — Space가 아니라 Workspace 전체에서 재사용됨 |
| `type` | `enum: person / organization / project / product / term` | 무엇의 레퍼런스인가. `organization`은 법인·팀 같은 행위주체, `product`는 그 주체가 만든 제품·서비스 자체(예: 비바리퍼블리카 vs 토스) — 판단 대상이 다르다 |
| `title` | `string` | 가리키는 대상의 이름 |
| `body` | `string` | 다듬어지며 유지되는 내용 (설명 포함) |
| `externalUrls?` | `string[]` | 대표 링크들 (홈페이지·LinkedIn 등) |
| `relatedReferenceIds?` | `uuid[]` | 관련 Reference — 명시적으로 이어지는 다른 Reference들(예: 제품과 그 제품을 만든 조직). `Digest.relatedDigestIds?`와 같은 성격 — 의미 관계가 아니라 느슨한 상호 참조라 방향 없음 |
| `tagIds?` | `uuid[]` | Tag — Digest와 같은 Workspace 태그 풀을 공유하되, 인용한 Digest의 태그에서 파생시키지 않고 독립적으로 직접 부여한다. Reference의 태그는 "왜 계속 중요한가"를, Digest의 태그는 "그 순간 어떤 판단이었나"를 나타내는 별개 축이다 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Changeset

한 번의 변경(원본 인제스천·충돌 해결·합치기·수동 편집·되돌리기)을 묶는 단위. 진술·관계의 생성·제거를 묶어 리뷰·되돌리기·이력으로 다룬다. 검토 흐름이 개별 진술·관계가 아니라 이 묶음에 붙는다 — GitHub의 커밋/PR과 같은 자리다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `type` | `enum: ingestion / relation / manual / revert` | 무엇이 일으킨 변경인가. `relation`은 관계 엔진이 만든 변경. 모순·중복 같은 관계의 *종류*는 changeset이 아니라 `Relation.type`(conflicts/duplicates)이 구분한다 — changeset 레벨에서 또 나누면 같은 정보를 두 군데 적는 중복 축이라 conflict/merge 타입은 두지 않는다 |
| `status` | `enum: pending / applied / rejected` | 변경셋 생애 (되돌림은 revert 변경셋으로 파생). `rejected`는 pending 제안을 사람이 거절한 종착 상태 — 행으로 남아 "엔진 제안 → 사람 거절"의 흔적이 되고 재제안 가드가 본다 |
| `changes` | `Change[]` | 이 변경셋이 가하는 연산들 |
| `sourceId?` | `uuid` | `ingestion`·`relation`이면 어느 원본이 방아쇠였나 |
| `spaceId?` | `uuid` | 소속 Space — Space 콘텐츠(Source·Digest·Statement·Relation)에서 트리거된 경우만 채워짐. Reference 직접 수정처럼 Workspace 스코프 콘텐츠가 대상이면 비움 |
| `revertsId?` | `uuid` | 되돌리는 대상 변경셋 (`revert`에서만) |
| `createdAt` | `Date` | 만들어진 때 |
| `authorId?` | `uuid` | 사람이 일으킨 변경의 주체 (엔진이면 없음) |

### Change

`Changeset.changes`의 원소.

| key | 타입 | 설명 |
|---|---|---|
| `action` | `enum: create / archive / restore / modify` | 연산. `restore`는 archive의 역연산(archived→active 되살림) — 되돌리기/redo가 역연산표 하나(create→archive, archive→restore, restore→archive)로 닫힌다 |
| `targetType` | `enum: statement / relation / source / digest / reference` | 대상 종류 |
| `targetId` | `uuid` | 대상 |
| `data?` | `object` | `create`: 만들어진 시점의 필드·값 그대로. `modify`: `{ before, after }` — 바뀐 필드만 이전/이후 값을 함께 담아 그 Change 하나만으로 자기완결적으로 복원 가능하게 함(체이닝 불필요). `archive`·`restore`엔 없음(대상은 `targetId`로 충분) |

`source`·`digest`·`statement`·`relation`은 `create`/`archive`만 — 확정 후 불변이라 `modify` 없음. `source`는 archive 후 새로 create하는 것을 "원본 수정"으로 편의 노출한다(`manual` changeset) — 이건 Source→파생물 전체가 재인제스천되는 무거운 동작이라는 걸 사용자가 감수하는 명시적 선택이다. `digest`도 확정(active) 후 같은 방식의 "Digest 수정" 편의 기능을 갖는다(`manual` changeset) — Statement가 이미 그 Digest를 안정적 근거로 참조하고 있어서 Digest만 콕 집어 고치면 그 위에 쌓인 관계·판정이 고아가 될 수 있지만(Source 레벨 되돌리기가 겪는 문제를 한 단계 아래서 반복), 이건 Source 레벨 수정에서도 이미 감수하기로 한 같은 위험이고, Digest 레벨은 오히려 더 정밀하다(한 Source에서 나온 다른 형제 Digest는 안 건드림). "수정" 버튼을 누르면 상세 페이지에서 그 Digest의 기존 값을 채운 초안을 클라이언트 상태로 가볍게 편집하고(별도 `pending` changeset을 서버에 persist하지 않는다), 확정하는 순간 `manual` changeset이 생기며 옛 Digest의 archive와 새 Digest의 create가 그 안에서 동시에 적용된다(확정 전에 이탈하면 아무 흔적도 남지 않는다). 새 Digest도, 그 `manual` changeset도 같은 `sourceId`를 유지한다 — `manual`의 `source_id NULL` 제약을 풀어 Digest 수정본이 원본에 매이게 했다(Reference 수정처럼 원본과 무관한 `manual`만 `source_id`를 비운다). 이래야 Source 완전 삭제 purge와 새 Digest 재추출이 `source_id`로 바로 도달한다 — 수동 수정이라는 출처는 `source_id`(어느 원본인지)가 아니라 `type: manual`이 구분한다. 확정 전(pending 초안 단계)의 편집은 이것과 별개로, 애초에 archive할 대상이 없는 첫 확정이라 이 절차가 필요 없다. `statement`는 `manual`로 단독 archive("가리기")만 가능하고 create/재생성은 없다 — Narration이 직접 인용하는 증거 단위라 Digest보다도 안 바뀌어야 할 이유가 더 크다. `relation`은 독립적인 `manual` 교정이 없다 — 틀린 관계는 대부분 relation 변경셋의 거절(`rejected`)로 잡히고(pending 단계), 그 외엔 끝점 Statement archived의 캐스케이드로만 archived된다. `reference`는 `create`·`modify`·`archive` 다 쓴다 — `modify`가 본질(계속 다듬어지는 게 존재 이유)이고, `archive`는 정리용(더 이상 안 쓰는 엔트리를 접음, 과거 인용은 그대로 유효). Reference의 과거 상태는 그 Reference를 대상으로 한 Change들을 시간순으로 훑어 재구성한다(별도 버전 필드 불필요). Reference의 과거 Change에 남는 민감정보(사람이 직접 입력한 경우)는 별도 리댁션 메커니즘을 두지 않는다 — git이 과거 커밋에 남은 평문 비밀값을 이력에서 지워주지 않는 것과 같은 이유로, 발생 확률 대비 복잡성이 안 맞는다.

Topic·Tag는 `targetType`에 없다 — 판단·사실 콘텐츠가 아니라 찾기용 라벨이라 잘못 바뀌어도 판단을 오염시키지 않으므로, Changeset 리뷰·불변성 없이 가볍게 직접 CRUD한다(soft delete만 유지).

## Topic

재사용되는 라벨. Space 안에서만 재사용되며, 같은 라벨이 붙은 Digest들이 하나의 흐름(Thread)으로 모인다. 이름 자체로 자기설명적인 좁은 화제라 별도 정의(`body`)는 두지 않는다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `title` | `string` | 라벨 이름 |
| `spaceId` | `uuid` | 재사용 스코프 — 이 Space 안에서만 재사용됨 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Tag

재사용되는 라벨. Topic과 달리 Workspace 안에서 Space를 가로질러 재사용되고, 흐름을 만들지 않는다. 이름이 추상적인 방법론 분류라(예: 경쟁전략, 기술결정) 재사용 시 판단 기준이 될 정의가 필요하다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `title` | `string` | 라벨 이름 |
| `description` | `string` | 정의 — 재사용 시 이 태그가 맞는지 판단하는 기준 |
| `workspaceId` | `uuid` | 재사용 스코프 — Space를 가로질러 Workspace 안에서 재사용됨 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Workspace

사람과 결제를 묶는 계정 단위. 무엇이 보이고 안 보이는지는 여기서 정해지지 않는다(`10-concept-collaboration.md`). 회사 메일 도메인 합류·과금·전사 정책 등 협업 확장 시 세부는 지금 다루지 않는다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `name` | `string` | Workspace 이름 |
| `createdAt` | `Date` | 만들어진 때 |

`status` 없음 — 실제 구현(`spaces` 테이블)에도 없고, 삭제 화면 자체가 표면인벤토리에 없어 근거가 없다. 삭제가 필요해지면 그 안의 Space들에 이미 있는 완전 삭제 캐스케이드를 부채꼴로 실행하고, 다 비면 Workspace 자체를 제거한다(별도 상태 불필요).

### WorkspaceMember

`Space.Member`와 같은 패턴 — 별도 `id` 없는 조인 테이블.

| key | 타입 | 설명 |
|---|---|---|
| `workspaceId` | `uuid` | 소속 Workspace |
| `userId` | `uuid` | User (`auth.users` 참조) |
| `role` | `enum: owner / member` | Workspace 운영 권한 |
| `createdAt` | `Date` | 합류한 때 |

## Space

기록(원본·다이제스트·진술·관계)이 담기는 소유 단위 — Reference는 Space가 아니라 Workspace 스코프다. Workspace 안에 여러 개 있을 수 있다. 멤버 1명이면 개인, 여러 명이면 공동 소유 — 같은 단위이고 멤버 수만 다르다(`10-concept-collaboration.md`).

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `name` | `string` | Space 이름 |
| `workspaceId` | `uuid` | 소속 Workspace |
| `createdAt` | `Date` | 만들어진 때 |

`status` 없음 — 같은 이유(실제 구현에 없고, 삭제 화면 근거 없음). 삭제가 필요해지면 그 안의 Source들에 이미 있는 완전 삭제 캐스케이드를 부채꼴로 실행.

## User

로그인하는 사람 단위. Nema가 별도로 모델링하지 않고 Supabase Auth의 `auth.users`를 그대로 쓴다 — 이름·이메일 등은 거기 있고 중복 저장하지 않는다.

Nema 쪽에서 붙이는 유일한 확장은 `profiles`(`user_id` → `auth.users` 참조)이며, 현재는 `contentLanguage`(UI 언어와 별개인 콘텐츠 언어 설정) 하나만 갖는다.

## Member

특정 Space에 속한 User. 실제 구현된 `space_members` 테이블을 그대로 반영 — 별도 `id` 없이 순수 조인 테이블이다.

| key | 타입 | 설명 |
|---|---|---|
| `spaceId` | `uuid` | 소속 Space |
| `userId` | `uuid` | User (`auth.users` 참조) |
| `role` | `enum: owner / member` | Space 운영 권한 |
| `createdAt` | `Date` | 합류한 때 |

## 동작 규칙

- **Owner 0명 금지, 계정 삭제 시 소유권 이전 강제** — Space·Workspace는 항상 `owner` role인 Member가 최소 1명 있어야 한다(Slack·Notion 공통 원칙). User가 계정을 삭제하려는데 자신이 owner이고 다른 멤버가 있으면, 먼저 소유권을 다른 멤버에게 넘겨야 삭제가 진행된다(자동 승계 없음). 정말로 유일한 멤버라면 그 Space·Workspace 전체가 완전 삭제 캐스케이드를 탄다. 다른 멤버가 있는 곳에서 그냥 나가는(비-owner) 경우는 그 Member 행만 제거.
- **authorId는 사람 삭제와 무관하게 콘텐츠를 보존** — `Source`·`Digest`·`Changeset`의 `authorId`는 소유가 아니라 귀속(누가 만들었나) 정보일 뿐이라, User가 삭제돼도 `ON DELETE SET NULL`로 콘텐츠는 남고 귀속만 사라진다(공유 Space에서 다른 사람이 그 위에 쌓은 관계·판단을 보존하기 위함). `profiles`는 `ON DELETE CASCADE`(이미 구현됨).
- **원본 빼기 → 파생 효과 전체 되돌림** — 원본을 `pending`으로 되돌리는 건 그 원본이 만든 ingestion Changeset을 되돌리는 것과 같다. 그 Changeset이 만든 Digest·Reference·진술·관계도 함께 되돌아간다(archived). 재개하면 그 옛 산출물을 되살리는 게 아니라 처음부터 새로 인제스천한다. 단순 soft-archive가 아니라 파생 효과 전체를 되돌리는 동작이다.
- **끝점 archived → 관계 연쇄** — 끝점 진술이 `archived`되면 걸린 관계도 함께 `archived`된다(연쇄 soft-archive). 끝점을 되살리면 관계도 돌아온다.
- **변경셋 적용 (트리거별)** — `ingestion`은 항상 `pending`으로 시작한다. Digest·Reference 후보를 사람이 확인해야(1단계, Digest 리뷰 화면) `applied`로 전환되고, 그 순간 Statement·Relation 생성(2단계)이 시작된다 — 애매해서가 아니라 모든 ingestion이 거치는 필수 게이트. `manual`·`revert`는 이미 사람이 확정한 단일 동작이라 곧바로 `applied`. 2단계에서 관계 엔진이 새 Statement를 기존 것들과 대조한 결과는 `relation` 변경셋으로 나온다: 확신·비충돌 관계는 배치당 1개의 `relation` 변경셋이 곧바로 `applied`로 조용히 적용되고, 애매하거나 모순(`conflicts`)·같은 뜻의 중복(`duplicates`)인 쌍은 **쌍 하나마다** 별도의 `relation` 변경셋이 `pending`으로 발생한다(쌍 N개면 changeset도 N개 — 사람이 하나씩 판정하므로 한 changeset으로 묶으면 부분 판정을 표현 못 함). pending 제안은 활성 그래프 밖에서 대기하다 사람이 적용(`applied`)하거나 거절(`rejected`)한다 — 모순·중복은 엔진이 잘못 판단하면 되돌리기 전엔 드러나지 않는 채로 진술이 사라지거나 잘못 엮이므로 확신도와 무관하게 항상 사람 확인을 거친다.
- **레퍼런스·주제·태그는 병합을 고려하지 않음** — 중복 병합(`duplicates`)은 Statement 전용이다. Reference·Topic·Tag는 Source→Digest/Reference 변환 시 이미 레지스트리에 등록된 것과 매칭해 인용을 제안하므로, 애초에 같은 대상이 중복 생성되는 경우가 최소화된다. 매칭이 안 되면(협업 확장 시 Space 권한이 갈리는 경우 등) 병합 대신 중복을 그대로 허용한다.
- **pending은 확정 전 초안** — `pending` 상태인 changeset의 `changes`는 확정 전까지 사람이 자유롭게 고쳐 쓸 수 있는 초안이다(Digest 리뷰 화면의 본문·주제·태그 수동 편집, relation 제안 판정 시 제안된 관계를 다른 내용으로 바꾸는 것 모두 여기 해당). `applied`로 전환되는 순간 그 시점 내용으로 고정된다.
- **되돌리기 (append-only)** — `applied`를 되돌릴 땐 status를 바꾸지 않고, 원본을 가리키는 revert 변경셋을 *추가*한다. "되돌려졌나"는 그 존재로 파생(폐기를 `replaces`에서 파생시킨 것과 같은 방식). 되돌림의 되돌림(redo)도 revert를 또 추가하면 된다.
- **`authorId` 규칙** — 사람이 *직접 만든 것*에만 붙는다: 원본(제공)·Digest(제공)·사람 주도 변경셋(`ingestion`·`manual`·`revert`). 엔진 산물(진술·관계)엔 없고, 소유·출처는 `digestId` → `Digest.authorId`로 파생. (있음→사람, 없음→엔진)
- **참·거짓 미판단** — 시스템은 진술의 진위를 가리지 않는다. 진술의 유효함은 *존재 + 대체(`replaces`·`duplicates`) 관계 없음*으로 정해지고, 모순은 `conflicts`로 드러내되 어느 쪽이 옳은지는 사람이 정한다. "언제부터 참인가" 같은 시간 표현은 진술 내용에 담겨 읽기 시점에 풀린다 — 시스템이 "지금 유효한가"를 기계적으로 계산하는 동작이 없으므로 별도 시각 필드를 두지 않는다.
- **Topic은 Digest 확정 시 붙는 재사용 라벨** — 사람이 Digest 리뷰 화면에서 확정할 때 붙이며(`Digest.topicIds?`), Space별 레지스트리로 영속해 재사용된다. 같은 Topic이 붙은 Digest들이 다시 켰을 때 하나의 Thread로 모인다.
- **완전 삭제(trashed → 배치 purge)** — `trashed`는 사용자가 명시적으로 삭제를 선택했다는 신호이고(soft archive와 달리 무기한 보존이 아님), `trashedAt` 이후 보관 기간(30일)이 지나면 배치 잡이 완전 삭제를 실행한다. 훑는 대상은 그 원본의 `sourceId`를 가진 **모든** changeset이다(`ingestion` + `relation` — 관계 엔진의 산물도 같은 그물에 걸린다). 완전 삭제는 대상 changeset의 `changes`를 하나씩 훑어 `create`면 그 대상을 hard delete, `modify`면 이전 값으로 복원한다 — Reference처럼 여러 changeset이 공유하는 대상도 "이 changeset이 만든 것"과 "이 changeset이 다듬은 것"을 create/modify 구분만으로 정확히 나눠 처리한다(별도 케이스 분기 불필요). **그 Change 레코드 자체도 함께 hard delete한다** — `create` Change의 `data`엔 만들어진 내용의 복사본이 남아있어서, 대상만 지우고 Change를 남기면 그 안에 원본 내용이 그대로 남는다(git이 과거 커밋에 남은 비밀값을 못 지우는 것과 같은 구조적 문제라 정면으로 회피). 마지막으로 트리거가 된 레코드 자체도 hard delete한다. 참조가 끊기지 않는 이유는, 대상이 되는 모든 changeset을 그 순서대로 되돌리기 때문이다.

## 열어두는 것

- Reference 변경 이력을 사용자가 보는 표면 — Reference 전용 페이지("원본 보기"처럼)에서 이전 버전을 보는 쪽으로 기움. 변경 이력을 별도 리스트로 둘지는 표면 설계 단계에서.
- 원본 빼기의 정확한 되돌리기 절차 — 한 Source에서 여러 Digest·Changeset이 파생됐을 때 되돌림 범위를 어떻게 잡는지, 사람이 그 위에서 이미 내린 판정(충돌 해소 등)을 어떻게 다루는지. Source·Digest의 `manual` 수정(archive+create)이 같은 고아 판단 위험을 갖는다는 것도 같이 — Digest 레벨은 형제 Digest를 안 건드려 더 정밀하지만, 위험 자체가 없어지는 건 아니다. 구체적으로: ingestion A 이후 시간순으로 B·C·D가 A의 산출물(Statement 등)을 참조하는 관계·판정을 쌓았을 때, A를 되돌리고 재인제스천(A2)하면 그 참조들이 깨지고 A2로 자동 복구되지 않는 문제(고아 판단). 우선순위 낮음 — 발생 확률(원본 되돌리기 자체가 드묾 + 이후 참조가 쌓여있어야 함)과 심각도(전제가 바뀐 경우는 캐스케이드가 오히려 맞는 동작이고, 표기만 고친 경우는 재인제스천 시 관계 엔진이 기존 활성 Statement와 다시 대조하며 자연스럽게 복구됨) 둘 다 낮음. 액션 없이 관찰만, 실사용에서 실제로 문제되면 재검토. 인테이크 개편 슬라이스에서.
- Reference의 "원본 빼기" 캐스케이드 범위 — 지금 규칙("그 Changeset이 만든 Digest·Reference·진술·관계도 함께 되돌아간다")이 Reference를 통째로 archived시키는데, 완전 삭제 때처럼 create/modify를 구분 안 하면 다른 Source의 Digest가 그 뒤에 `modify`로 다듬은 기여분까지 같이 archived될 수 있다. 완전 삭제 purge와 같은 create/modify 구분이 일반 되돌리기에도 필요한지 확인 필요.
- 원본 실제 시점(발생·작성) — `createdAt`(시스템에 들어온 때)과 별개인 실제 발생/작성 시각. 소급 입력 등에서 문제되면 추가.
- 공유·그룹·세부 권한 *규칙* — 협업 단계에서. 소유·멤버십의 자리(Space=콘텐츠 그릇, Member=사람 묶음)는 오늘 확정했으니 재설계 없이 멤버 추가만으로 확장 가능. Group·세밀한 공유 축은 `10-concept-collaboration.md`에 개념만 있고 아직 스키마 반영 전.
- Space·Workspace 완전 삭제의 확인 UX — 파급 범위가 제일 크므로 Source보다 무거운 확인 절차가 필요(영향받는 Source·Digest 개수 표시, 이름 타이핑 확인 등). 삭제 메커니즘 자체는 Source의 완전 삭제를 부채꼴로 재사용하면 되지만, 그 앞의 확인 화면은 표면 설계 단계에서.
- 관계의 관계(reify) — 관계가 다른 관계의 끝점이 되어야 하면 그때 노드로 승격
- 원본 에셋(음성·이미지·파일)·`Locator` 형식 — body 외 원재료 묶음, 추후
- 전사·OCR 주체 — 누가 텍스트로 변환하나 (입력 경계)
- `trashed` 목록 화면 — 삭제 의도가 확정된 것들을 보여주고 남은 보관 기간을 노출하는 자리. 표면인벤토리에 아직 없음.
- Topic·Tag·Reference의 `archived` 복구 화면 — 원칙상 되살릴 수 있어야 하는데, Topic·Tag는 전용 목록 화면 자체가 표면인벤토리에 없어 복구할 자리가 없다(Tag는 "Digest 리뷰 화면의 셀렉트로 생성·수정"뿐). Reference는 "Reference 목록"이 있어 필터만 추가하면 되지만 명시된 건 아니다.
- 노이즈 필터 — 종류에 묶을지/별도 기준을 둘지 포함해, 기능 구현 단계에서

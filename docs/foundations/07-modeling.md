# 모델링

## Source

시스템이 손대지 않고, 사람이 작성한 그대로 박제하는 원재료. 의미로 다뤄지지 않는다. Digest가 여기서 만들어진다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `spaceId` | `uuid` | 어느 Space에 제출됐나 |
| `title?` | `string` | 원문을 식별하는 짧은 이름. 외부 연동(Gmail Subject, Tiro 회의 제목 등)은 그 시스템이 준 값을 그대로 쓴다. 제목이 자연히 없는 입력(직접 타이핑·붙여넣기)은 제출 즉시 엔진이 원문을 보고 채운다. 편집 가능 범위는 아래 동작 규칙 "Source.title은 초안 상태에서만 편집 가능하다" 참고 |
| `body` | `string` | 원문 텍스트(타이핑·붙여넣기·전사·추출 텍스트) |
| `createdAt` | `Date` | 원문이 시스템에 들어온 때 |
| `status` | `enum: pending / active / trashed` | 존재 상태. `active`는 "이 원문의 인제스천이 끝나 파생물(Digest)이 생긴 상태"다. 저장 전 사람 확인 게이트를 없애면서(아래 동작 규칙 "변경셋 적용은 트리거마다 다르게 시작한다" 참고) "사람이 리뷰를 확정함"이라는 옛 정의는 성립하지 않는다 — 확정할 사람이 없다. `pending`·`active`·`trashed`의 정의와 전이 규칙은 아래 동작 규칙 "Source.status는 한 방향으로만 전이한다" 참고 |
| `trashedAt?` | `Date` | `trashed`가 된 시각. 완전 삭제 배치가 보관 기간 경과 여부를 판단하는 기준 |
| `authorId?` | `uuid` | 누가 넣었나(사용자 id). User 삭제 시 `ON DELETE SET NULL`이라 nullable |
| `authorName?` | `string` | `authorId`가 채워질 때 생성 시점의 표시 이름을 함께 스냅샷한다. `authorId`가 계정 삭제로 NULL이 돼도 이 값은 남아 "누가 만들었는지" 표시가 유지된다(아래 동작 규칙 "authorId는 사람 삭제와 무관하게 콘텐츠를 보존한다" 참고). 계정이 살아있어도 이후 이름을 바꾸면 과거 값엔 반영되지 않는 생성 시점 고정값이다 |

## Digest

Source를 사람이 읽기 좋게 정리한 것. 주된 칸(아래 참고)이 곧 Statement다 — 따로
추출하지 않는다(아래 Statement 참고).

| key | 타입 | 설명 |
|---|---|---|
| `sourceId` | `uuid` | 어느 Source에서 나왔나. Source 1개가 여러 Digest를 낳을 수 있다(한 뭉치 안에 여러 판단 유형이 섞여 있으면 유형별로 쪼개진다). 새 Source는 새 Digest를 만들 뿐 기존 Digest를 안 건드린다 |
| `spaceId` | `uuid` | 소속 Space. `sourceId`로 유추 가능하지만, Space 오버뷰의 메인 피드(Topic별 Digest 피드)가 이 값으로 직접 조회하므로 따로 둔다 |
| `locator?` | `Locator` | Source 안에서 이 Digest가 나온 위치(선택 — `body`의 문자 범위 등). 평소엔 Digest 자체로 판정하고, 원문 대조가 필요할 때만 쓴다 |
| `title` | `string` | 제목. 헤드라인처럼 짧게 |
| `description` | `string` | 한 줄 요약. 피드에서 title 다음으로 보이는 미리보기 |
| `body` | `DigestBody` | 정리된 내용. 타입별로 다른 구조(아래) |
| `topicIds?` | `uuid[]` | Topic(Space 안에서 재사용). 배열이지만 **엔진은 하나만 붙인다** — 아래 동작 규칙 "Topic은 엔진이 붙이고, 새로 만드는 걸 아낀다" 참고. 여러 개가 필요해지면 스키마 변경 없이 그 제약만 풀면 된다 |
| `tagIds?` | `uuid[]` | Tag(Workspace 안에서 Space 가로질러 재사용) |
| `relatedDigestIds?` | `uuid[]` | 관련 Digest. 명시적으로 이어지는 다른 Digest들이다. Topic·Thread와 달리 의도적이고 정밀한 링크다. 의미 관계(지지·충돌 등)가 아니라 느슨한 상호 참조라 방향이 없다 |
| `referenceIds?` | `uuid[]` | 이 Digest가 언급하는 Reference들(인물·조직·프로젝트·제품·개념) |
| `externalUrls?` | `string[]` | 정리 과정에서 원문에서 뽑아낸 외부 링크들(Slack 메시지, Notion 페이지 등) |
| `mcpVisible` | `boolean` | 기본값 true. MCP로 연결된 외부 AI 클라이언트의 조회 결과에 이 Digest(와 파생된 진술·관계)를 포함할지 정한다. false면 존재 힌트 없이 완전히 제외된다. Nema 웹앱 자체의 열람·검색에는 영향을 주지 않는다(외부 접근 경로만 통제하는 값이다) |
| `authorId?` | `uuid` | 작성자(User). User 삭제 시 `ON DELETE SET NULL`이라 nullable |
| `authorName?` | `string` | 생성 시점 표시 이름 스냅샷. `Source.authorName`과 같은 성격(위 참고) — Digest는 확정 시점에 다시 계산하지 않고 자신이 나온 Source의 스냅샷을 그대로 승계한다 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

### DigestBody

`type`에 따라 모양이 갈리는 판별 유니언이다. 모든 필드는 optional이다. 원문에 없으면 비워두고 지어내지 않는다.

**Decision** (`type: 'decision'`)

| key | 타입 | 설명 |
|---|---|---|
| `situation?` | `string` | 상황. 무엇을 정해야 했는가 |
| `choice?` | `string` | 선택. 무엇으로 정했는가 |
| `reason?` | `string` | 이유. 왜 그렇게 골랐는가 |
| `tradeoff?` | `string[]` | 트레이드오프. 감수한 것 |
| `alternatives?` | `string[]` | 대안. 검토했지만 기각한 것 |

**Pending** (`type: 'pending'`)

| key | 타입 | 설명 |
|---|---|---|
| `question?` | `string` | 질문. 아직 뭘 못 정했는가 |
| `background?` | `string` | 배경. 왜 이 질문이 생겼는가 |
| `branches?` | `string[]` | 갈래. 검토 중인 후보들 |
| `resolutionCondition?` | `string` | 해소 조건. 뭐가 확인되면 풀리는가 |

**Learning** (`type: 'learning'`)

| key | 타입 | 설명 |
|---|---|---|
| `finding?` | `string` | 발견. 무엇을 확인했는가 |
| `evidence?` | `string` | 근거. 무엇을 보고 그렇게 확인했는가 |

**Idea** (`type: 'idea'`)

| key | 타입 | 설명 |
|---|---|---|
| `concept?` | `string` | 발상. 무슨 아이디어인가 |
| `background?` | `string` | 배경. 왜 이 아이디어가 떠올랐는가 |
| `branches?` | `string[]` | 갈래. 파생되는 후보들 |

**Assumption** (`type: 'assumption'`, 실사용 검증 없는 신규 타입)

| key | 타입 | 설명 |
|---|---|---|
| `assumption?` | `string` | 가정 내용. 뭘 사실로 놓고 진행하는가 |
| `evidence?` | `string` | 근거. 왜 그렇게 믿는가(약해도 된다) |
| `impact?` | `string` | 영향. 틀렸을 때 뭐가 바뀌는가(맞았을 때는 원래 계획대로라 기록할 실익이 적다) |
| `verificationCondition?` | `string` | 검증 조건. 뭘 보면 맞았는지 틀렸는지 알 수 있는가 |

## Statement

하나의 '왜'를 담은 문장 크기의 의미 한 조각. 맥락의 단위. **독립된 테이블로는 없다** —
Digest의 주된 칸(결정의 `choice`, 학습의 `finding` 등)이 곧 그 진술이다. 관계는 진술을
따로 뽑지 않고 Digest 전체를 임베딩해 비교하고, Digest 단위로 잇는다(아래 Relation
참고). 개념은 남고 행만 사라진 것이라, "Digest 하나에 진술 하나"라는 성질은 그대로다.

## Relation

두 Digest를 잇는 방향 있는 선. "무엇이 무엇을 지지·반박·대체하는지"의 그래프가 네마가
지키는 자산이다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `type` | `enum: support / weaken / duplicate / conflict / resolve` | 관계 종류. `resolve`는 짝이 되는 경로가 따로 필요하고 미결이 쌓여야 값이 생겨 아직 안 만들었다(미완성이 아니라 순서상 뒤에 있는 것) |
| `fromId` | `uuid` | 출발 Digest(A) |
| `toId` | `uuid` | 도착 Digest(B) |
| `spaceId` | `uuid` | 이 관계를 만든 쪽의 Space. 관계는 Space를 가로지를 수 있다(다른 사람 Digest에 반박·근거를 닮, `10-concept-collaboration.md`). 그래서 끝점만으론 어느 Space 소속인지 모호해져, 명시적으로 저장한다. RLS 판정에도 쓴다 |
| `createdAt` | `Date` | 관계가 생긴 때 |
| `status` | `enum: active / archived` | 존재 상태. 끝점 archived 시 연쇄 규칙은 아래 동작 규칙 "끝점이 archived되면 관계도 연쇄로 archived된다" 참고 |

**방향 의미**
- `support` A→B: A가 B를 뒷받침한다("B인 이유는 A"). 받는 쪽(B)은 늘 Decision이다.
- `weaken` A→B: A가 B가 딛고 선 것을 무너뜨린다. `support`의 반대 방향. 받는 쪽(B)은 늘 Decision이다.
- `duplicate` A→B: A와 B가 같은 것을 말한다(같은 유형끼리만). 저장은 새 것(A)→기존 것(B) 방향이지만 논리적으로는 대칭이다.
- `conflict` A→B: A와 B가 부딪힌다(같은 유형끼리만). `duplicate`와 같은 판정에서 갈리고, 저장 방향도 같다.
- `resolve` A→B: A(답)가 B(질문, 또는 검증되지 않은 가정에서 나온 주장)를 닫는다. 아직 안 만들었다.

**대체·병합은 관계 유형이 아니다.** "A가 B를 대체했다"는 지금의 사이가 아니라 그때
일어난 일이라, Digest 수정이 그렇듯(아래 동작 규칙 참고) 관계가 아니라 변경 이력
쪽에서 다룬다.

이번 라운드는 지지·약화·중복·충돌 넷 다 아무것도 접지 않는다 — 확정하면 한쪽이
접히는 사람의 리뷰·병합 초안·대체는 아직 안 만들었고, 만들지도 아직 결정 전이다
(도그푸딩으로 필요성부터 본다). 넷 다 조용히 걸리기만 하고, 양 끝이 그대로 산다.

## Reference

Digest 틀에 안 맞지만 반복 참조되는 것을 위한 곳. 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이 다듬어진다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `workspaceId` | `uuid` | 재사용 스코프. Space가 아니라 Workspace 전체에서 재사용된다 |
| `type` | `enum: person / organization / project / product / term` | 무엇의 레퍼런스인가. `organization`은 법인·팀 같은 행위주체, `product`는 그 주체가 만든 제품·서비스 자체다(예: 비바리퍼블리카 vs 토스). 판단 대상이 다르다 |
| `title` | `string` | 가리키는 대상의 이름 |
| `body` | `string` | 다듬어지며 유지되는 내용(설명 포함) |
| `externalUrls?` | `string[]` | 대표 링크들(홈페이지·LinkedIn 등) |
| `relatedReferenceIds?` | `uuid[]` | 관련 Reference. 명시적으로 이어지는 다른 Reference들이다(예: 제품과 그 제품을 만든 조직). `Digest.relatedDigestIds`와 같은 성격이다. 의미 관계가 아니라 느슨한 상호 참조라 방향이 없다 |
| `tagIds?` | `uuid[]` | Tag. Digest와 같은 Workspace 태그 풀을 공유하되, 인용한 Digest의 태그에서 파생시키지 않고 독립적으로 직접 부여한다. Reference의 태그는 "왜 계속 중요한가"를, Digest의 태그는 "그 순간 어떤 판단이었나"를 나타내는 별개 축이다 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived / trashed` | 존재 상태. `trashed`는 완전 삭제 확인(아래 동작 규칙 참고)을 거쳐 들어가는, 배치 purge 대기 상태다. Source의 `trashed`와 뜻·메커니즘이 같다(30일 유예 후 배치 purge) |
| `trashedAt?` | `Date` | `trashed`가 된 시각. Source와 같은 용도로, 배치가 보관 기간 경과 여부를 판단하는 기준 |

## Changeset

한 번의 변경(원문 인제스천·충돌 해결·합치기·수동 편집·되돌리기)을 묶는 단위. 진술·관계의 생성·제거를 묶어 리뷰·되돌리기·이력으로 다룬다. 검토 흐름이 개별 진술·관계가 아니라 이 묶음에 붙는다. GitHub의 커밋·PR과 같은 자리다.

**`manual`(Digest·Reference 직접 수정·아카이브)은 모델엔 있지만 변경셋 목록(변경셋 탭) 화면엔 안 뜬다.** 아래 동작 규칙 "Digest·Reference 직접 편집은 변경셋 목록에 안 뜬다" 참고.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자(내부용) |
| `number` | `int` | Space 안에서 순차 증가하는, 사람이 읽고 지칭하기 위한 번호(GitHub의 PR·이슈 번호와 같은 역할). `id`(uuid)는 내부 식별자일 뿐이고, 화면에 노출하고 "체인지셋 #12"처럼 대화에서 지칭하는 건 이 값이다. `title`은 편집 가능해 안정적인 앵커가 못 되지만 이 번호는 안 바뀐다. `manual`도 이 시퀀스를 그대로 공유한다. 화면에 안 보인다고 번호 체계까지 따로 둘 이유는 없다(GitHub도 PR·Issue가 번호를 공유하는 것과 같다) |
| `type` | `enum: ingestion / relation / manual / revert` | 무엇이 일으킨 변경인가. `relation`은 관계 엔진이 만든 변경이다. 모순·중복 같은 관계의 *종류*는 changeset이 아니라 `Relation.type`(conflicts/duplicates)이 구분한다. changeset 레벨에서 또 나누면 같은 정보를 두 군데 적는 중복 축이 되므로, conflict·merge 타입은 두지 않는다 |
| `title?` | `string` | 목록·판정 화면 헤더에 쓰는 제목. 변경셋 탭에 뜨는 타입(`ingestion`/`relation`/`revert`)은 항상 값이 있어야 목록이 일관되게 렌더링된다. `manual`은 애초에 변경셋 탭·상세 어디에도 안 뜨는 타입이라(위 참고) 예외적으로 항상 null — 채워도 읽힐 자리가 없다. 타입별 생성 규칙과 편집 가능 여부는 아래 동작 규칙 "Changeset.title은 타입별로 생성 방식과 편집 가능 여부가 다르다" 참고 |
| `status` | `enum: open / closed` | 변경셋 생애(진행 중인지 끝났는지만 구분). 되돌림은 revert 변경셋으로 파생된다 |
| `outcome?` | `enum: applied / discarded` | `closed`일 때만 의미 있다. 어떻게 끝났는지를 나타낸다. `status`(끝났는지)와 `outcome`(어떻게 끝났는지)을 필드로 분리해, 한 값이 두 질문을 겸하지 않게 한다. `applied`는 확정. `discarded`는 적용하지 않고 닫힌 것이다. `relation`에서 사람이 제안(충돌·중복)을 거절한 경우가 여기 속한다(행으로 남아 재제안 가드가 본다). **`ingestion`은 이 값을 쓰지 않는다** — 게이트가 없어져 사람이 리뷰를 버리는 경로 자체가 사라졌고, 늘 `applied`로 태어난다. `manual`(Digest·Reference 직접 수정)은 이 값을 안 쓴다(아래 동작 규칙 "Digest·Reference 직접 편집은 변경셋 목록에 안 뜬다" 참고). 제출 시점에만 changeset이 생겨 늘 `applied`로 시작한다 |
| `changes` | `Change[]` | 이 변경셋이 가하는 연산들 |
| `sourceId?` | `uuid` | `ingestion`·`relation`이면 어느 원문이 방아쇠였나 |
| `spaceId?` | `uuid` | 소속 Space. Space 콘텐츠(Source·Digest·Statement·Relation)에서 트리거된 경우만 채워진다. Reference 직접 수정처럼 Workspace 스코프 콘텐츠가 대상이면 비운다 |
| `revertsId?` | `uuid` | 되돌리는 대상 변경셋(`revert`에서만) |
| `invalidatedById?` | `uuid` | 이 changeset을 무효화한 다른 changeset. 사람이 "중복 아님"이라고 판단해 거절한 것과 구분하기 위한 값이다. 시나리오는 아래 동작 규칙 "한 Digest가 여러 곳과 동시에 중복될 수 있다" 참고 |
| `createdAt` | `Date` | 만들어진 때 |
| `authorId?` | `uuid` | 사람이 일으킨 변경의 주체(엔진이면 없음) |
| `authorName?` | `string` | 생성 시점 표시 이름 스냅샷. `authorId`가 있을 때만 있고, 엔진 산물(`ingestion`·`relation`)은 `authorId`처럼 항상 없다 |
| `closedById?` | `uuid` | 이 changeset을 닫은(판정한) 사람 — `authorId`(내용을 만든 사람)와 다른 축이다. `status`가 `closed`일 때만 값이 있을 수 있다. 계정 삭제 시 `SET NULL`로 지워지므로(`closedByName`은 스냅샷이라 안 지워짐), "AI(엔진)가 닫았는가"는 이 필드가 아니라 `closedByName`의 유무로 판단해야 한다. 되살리면(`open`으로 복귀) 이 값도 함께 지워진다 — 아직 아무도 안 닫은 changeset에 예전에 버린 사람이 남아있으면 안 되기 때문이다. `manual`·`revert`는 단일 액션이라 `authorId`만으로 "누가 만들었고 닫았는지"가 충분해 이 필드를 안 쓴다(항상 없음) |
| `closedByName?` | `string` | 닫힌 시점 표시 이름 스냅샷. `closedById`가 있을 때만 있다(`authorName`과 같은 짝 규칙). "AI(엔진)가 닫았는가"는 이 필드의 유무로 판단한다 — 계정 삭제로 지워지지 않는 값이라 신뢰할 수 있는 축이다 |

### Change

`Changeset.changes`의 원소.

| key | 타입 | 설명 |
|---|---|---|
| `action` | `enum: create / archive / restore / modify` | 연산. `restore`는 archive의 역연산이다(archived→active 되살림). 되돌리기·redo가 역연산표 하나로 닫힌다(create→archive, archive→restore, restore→archive) |
| `targetType` | `enum: statement / relation / source / digest / reference` | 대상 종류 |
| `targetId` | `uuid` | 대상 |
| `data?` | `object` | `create`는 만들어진 시점의 필드·값 그대로. `modify`는 `{ before, after }`다. 바뀐 필드만 이전·이후 값을 함께 담아, 그 Change 하나만으로 자기완결적으로 복원 가능하게 한다(체이닝 불필요). `archive`·`restore`엔 없다(대상은 `targetId`로 충분하다) |

타입별 `create`·`modify`·`archive` 범위와 changeset 목록 노출 여부는 아래 동작 규칙 참고.

## AccessLog

`mcpVisible=false`로 표시된 콘텐츠에 MCP 클라이언트가 실제로 접근했을 때만 남는 감사 기록. 일반(`mcpVisible=true`) 접근은 Nema를 쓰는 목적 자체라 기록하지 않는다. 범위를 좁혀야 실제로 봐야 할 때(민감 접근 확인) 노이즈 없이 볼 수 있다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `digestId` | `uuid` | 접근된 Digest. 진술·관계 경유로 접근된 경우도 그 근거가 된 Digest 기준으로 기록한다 |
| `userId?` | `uuid` | 이 MCP 세션의 소유자. User 삭제 시 `ON DELETE SET NULL`이라 nullable |
| `tool` | `string` | 호출된 MCP 도구 이름 |
| `accessedAt` | `Date` | 접근한 때 |

## Topic

재사용되는 라벨. Space 안에서만 재사용되며, 같은 라벨이 붙은 Digest들이 하나의 흐름(Thread)으로 모인다. 이름 자체로 자기설명적이라 별도 정의(`body`)는 두지 않는다.

한 건의 화제가 아니라 **여러 판단이 이어서 쌓이는 줄기**를 가리킨다. 목록으로 늘어놓았을 때 한눈에 읽히려면 개수가 적어야 하고, 그건 굵기를 직접 지시해서가 아니라 새로 만드는 걸 아껴서 얻는다(아래 동작 규칙 "Topic은 엔진이 붙이고, 새로 만드는 걸 아낀다" 참고).

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `title` | `string` | 라벨 이름 |
| `spaceId` | `uuid` | 재사용 스코프. 이 Space 안에서만 재사용된다 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Tag

재사용되는 라벨. Topic과 달리 Workspace 안에서 Space를 가로질러 재사용되고, 흐름을 만들지 않는다. 이름이 추상적인 방법론 분류라(예: 경쟁전략, 기술결정) 재사용 시 판단 기준이 될 정의가 필요하다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `title` | `string` | 라벨 이름 |
| `description` | `string` | 정의. 재사용 시 이 태그가 맞는지 판단하는 기준 |
| `color?` | `string` | 사용자가 의도적으로 고르는 표시 색상(예: "위험" 계열 태그를 빨강으로). 생성 시점(엔진 제안·사용자 생성 모두)에 팔레트 중 하나가 랜덤으로 미리 채워지지만, 최종 결정권은 항상 사용자에게 있다 — 확정 전까지 이름과 마찬가지로 몇 번이든 다시 고를 수 있다. 고정 팔레트 8종 enum(`tag_color`)으로 구현됐고, 기존 레지스트리 Tag도 마이그레이션으로 전부 백필됐다. Topic엔 없다(가벼운 화제 라벨이라 구분 색이 굳이 필요하지 않다고 판단했다) |
| `workspaceId` | `uuid` | 재사용 스코프. Space를 가로질러 Workspace 안에서 재사용된다 |
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Workspace

사람과 결제를 묶는 계정 단위. 무엇이 보이고 안 보이는지는 여기서 정해지지 않는다(`10-concept-collaboration.md`). 회사 메일 도메인 합류·과금·전사 정책 등 협업 확장 시 세부는 지금 다루지 않는다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `name` | `string` | Workspace 이름 |
| `createdAt` | `Date` | 만들어진 때 |

`status` 없음. 실제 구현(`spaces` 테이블)에도 없고, 삭제 화면 자체가 표면인벤토리에 없어 근거가 없다. 삭제가 필요해지면 그 안의 Space들에 이미 있는 완전 삭제 캐스케이드를 부채꼴로 실행하고, 다 비면 Workspace 자체를 제거한다(별도 상태 불필요).

### WorkspaceMember

`Space.Member`와 같은 패턴. 별도 `id` 없는 조인 테이블이다.

| key | 타입 | 설명 |
|---|---|---|
| `workspaceId` | `uuid` | 소속 Workspace |
| `userId` | `uuid` | User(`auth.users` 참조) |
| `role` | `enum: owner / member` | Workspace 운영 권한 |
| `createdAt` | `Date` | 합류한 때 |

## Space

기록(원문·다이제스트·진술·관계)이 담기는 소유 단위다. Reference는 Space가 아니라 Workspace 스코프다. Workspace 안에 여러 개 있을 수 있다. 멤버 1명이면 개인, 여러 명이면 공동 소유다. 같은 단위이고 멤버 수만 다르다(`10-concept-collaboration.md`).

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `name` | `string` | Space 이름 |
| `workspaceId` | `uuid` | 소속 Workspace |
| `createdAt` | `Date` | 만들어진 때 |

`status` 없음. 같은 이유다(실제 구현에 없고, 삭제 화면 근거 없음). 삭제가 필요해지면 그 안의 Source들에 이미 있는 완전 삭제 캐스케이드를 부채꼴로 실행한다.

## User

로그인하는 사람 단위. Nema가 별도로 모델링하지 않고 Supabase Auth의 `auth.users`를 그대로 쓴다. 이름·이메일 등은 거기 있고 중복 저장하지 않는다.

Nema 쪽에서 붙이는 유일한 확장은 `profiles`(`user_id` → `auth.users` 참조)다. 현재는 `contentLanguage`(UI 언어와 별개인 콘텐츠 언어 설정) 하나만 갖는다.

## Member

특정 Space에 속한 User. 실제 구현된 `space_members` 테이블을 그대로 반영한다. 별도 `id` 없이 순수 조인 테이블이다.

| key | 타입 | 설명 |
|---|---|---|
| `spaceId` | `uuid` | 소속 Space |
| `userId` | `uuid` | User(`auth.users` 참조) |
| `role` | `enum: owner / member` | Space 운영 권한 |
| `createdAt` | `Date` | 합류한 때 |

## 동작 규칙

- **Source.title은 초안 상태에서만 편집 가능하고, 인제스천이 시작되면 잠긴다.** 넣기 자체는 SNS 포스팅처럼 제목 필드 없이 가볍게 두면서도(가벼운 캡처 원칙), 제목이 자연히 없는 입력은 제출 즉시(Digest 추출보다 먼저) 엔진이 원문을 보고 채워 원문 탭·초안 목록에서 스니펫 대신 보여줄 이름을 확보한다. 사람은 원문이 대기 중인 초안 상태일 때만 직접 고칠 수 있다. 인제스천이 시작되면 잠기는데, 그 시점부터 `Changeset.title`이 화면의 편집 가능한 제목 역할을 대신하므로 편집 가능한 제목이 두 개가 되는 걸 피하기 위해서다.
- **Source.status는 한 방향으로만 전이한다.** `pending`은 파생물이 없는 상태다. 갓 생성돼 아직 인제스천이 안 끝났거나, ingestion 되돌리기로 되돌려진 경우가 여기 속한다("처리 중인 Source 작업 목록"에 노출). 게이트를 없애면서 "리뷰를 버려서 되돌아온" 갈래는 사라졌다 — 버릴 리뷰 자체가 없다. `active`는 인제스천이 끝나 Digest·Statement가 생긴 상태다. `trashed`는 사용자가 명시적으로 삭제를 선택한 상태다. `trashedAt` 이후 보관 기간(30일)이 지나면 배치로 완전 삭제된다. 전이는 한 방향 사슬이다: `active →(ingestion 되돌리기)→ pending →(삭제)→ trashed`. 복원은 `trashed → pending`뿐이다(파생 없는 상태라 pending 정의 그대로). active에서 파생을 유지한 채 원문만 치우는 동작은 없다. 삭제·복원(pending↔trashed)은 변경이력에 안 남는다. pending 원문은 그래프에 아무것도 심지 않아 리뷰·되돌리기의 대상이 아니기 때문이다.
- **Changeset.title은 타입별로 생성 방식과 편집 가능 여부가 다르다.** 초기값은 엔진이 생성 시점에 채운다(PR 제목처럼 매번 파생 계산하지 않고 저장된 값을 그대로 읽는다). `ingestion`은 엔진(LLM)이 **원문 전체**를 보고 생성한다. 결정·미결·학습·아이디어·가정처럼 서로 다른 타입의 Digest 여럿을 낳는 상위 단위는, 그 개별 판단들이 아니라 그것들이 나온 대화·논의 자체이기 때문이다. 여러 Digest가 같은 주제를 공유하면 자연스럽게 그 주제가 제목이 된다(예: 한 CS 정기 싱크에서 "결정"과 "미결"이 하나씩 나왔다면 "CS 채팅 UX 개선"). 서로 다른 주제가 섞여 있으면 LLM이 전체를 아우르는 요약형 제목("~에 대한 논의" 등)을 알아서 만든다(Topic 일치 여부로 분기하는 규칙을 애플리케이션 코드에 따로 둘 필요는 없다. 대표 Digest 제목을 기계적으로 조합하는 게 아니라 매번 LLM이 판단한다). 원문 전체를 요약하는 일이라 정답이 하나가 아니지만, 게이트가 없어져 `ingestion`은 `open` 단계를 거치지 않으므로 **생성 시점 값이 그대로 얼어붙는다**(아래 "편집 가능 여부는 status로 갈린다" 참고). `relation`은 하위 종류마다 원천이 다르다 — 확신 자동 적용 배치는 그 배치를 촉발한 원문(Source)의 제목을 그대로 차용하고(원문 하나당 배치 하나라 1:1, 겹칠 일이 없다), 판정 대기(pending)는 충돌(conflicts)이면 관계 판정 LLM이 함께 뽑은 요약 제목("정기 회의 일정 충돌" 등), 중복(duplicates)이면 병합 제안 Digest 초안의 제목을 쓴다. 그 외(요약·초안이 없는 conflicts·duplicates)는 끝점 진술 내용을 그대로 이어붙인 "A vs B"로 낮아진다. `revert`는 되돌리는 대상 changeset의 title을 UI 언어를 아는 애플리케이션 코드가 따옴표로 감싸고 "되돌림"을 붙여 조합한 뒤 그 결과 문자열을 그대로 저장한다(SQL 문자열 concat이 아니다 — 언어별 자연스러운 어순·복수형은 이 계층만 안다). 되돌림을 또 되돌리면 깊이를 세지 않고 그 문자열을 그대로 한 번 더 감싼다(`"OO" 되돌림` → `""OO" 되돌림" 되돌림`). `manual`은 title을 아예 채우지 않는다(항상 null) — `manual`은 변경셋 목록·상세 어디에도 안 뜨고 오직 대상(Digest·Reference)의 "변경 이력" 모달에서만 조회되는데, 그 모달의 행 라벨은 제목이 아니라 수정 시각+수정한 사람이라 changeset 제목 자체가 읽힐 자리가 없다. **편집 가능 여부는 타입이 아니라 `status`로 갈린다.** `open`이면 타입 무관하게 title을 직접 고쳐 쓸 수 있고, `closed`로 전환되는 순간 얼어붙는다. **`ingestion`은 `open`으로 태어나지 않으므로 여기 해당하지 않는다** — 게이트를 없애면서 확정 전 단계 자체가 사라졌다. `relation`(판정 대기)·`revert`(재판정 초안)만 `open`인 동안 이 자격을 얻는다 — 제목이 비교·되돌리기 대상에서 파생돼 나온 값이라도, 확정 전까지는 사용자가 줄이거나 다듬을 수 있어야 한다는 판단이다.
- **타입별로 `create`·`modify`·`archive` 범위가 다르다.** `source`·`digest`·`statement`·`relation`은 `create`·`archive`만 쓴다. 확정 후 불변이라 `modify`가 없다. Source는 확정(active) 후 직접 수정하는 경로 자체가 없다. Source는 "손대지 않고 그대로 박제"가 정의이기 때문이다. 고칠 수 있는 유일한 시점은 아직 `pending`인 동안뿐이고(초안 단계, `Source.title` 참고), 이건 changeset 없이 가볍게 이뤄진다(확정 전이라 archive할 대상 자체가 없다). 확정된 Source의 `body`를 고치는 기능은 없다. 원문을 있는 그대로 보존한다는 원칙과 정면으로 부딪히기 때문이다. Digest도 확정(active) 후 같은 방식의 "Digest 수정" 편의 기능을 갖는다(`manual` changeset). Statement가 이미 그 Digest를 안정적 근거로 참조하고 있어서, Digest만 콕 집어 고치면 그 위에 쌓인 관계·판정이 고아가 될 수 있다. 다만 Digest 레벨은 정밀하다. 한 Source에서 나온 다른 형제 Digest는 안 건드린다. Digest 상세 화면에서 본문(제목·요약·본문·타입) 영역의 "편집"을 누르면 그 자리에서 인라인으로 편집 모드가 열리지만(GitHub 이슈 본문처럼 화면 이동 없이), 이 시점엔 아직 changeset이 생기지 않는다. 편집 중인 내용은 클라이언트 상태로만 가볍게 존재한다(서버에 별도 changeset을 미리 저장하지 않는다). "제출"을 누르는 순간에야 `manual` changeset이 만들어지고 곧바로 `closed`+`outcome: applied`로 확정된다(그 changeset은 `open` 단계를 거치지 않는다). 그 안에서 옛 Digest의 archive와 새 Digest의 create가 동시에 적용된다. "취소"하거나 그냥 화면을 나가면 로컬 상태만 사라질 뿐 서버엔 아무 흔적도 안 남는다. 아직 아무것도 안 바뀐 상태라 되살릴 대상 자체가 없다(브라우저가 죽어서 미완성 편집을 잃는 정도는 감수한다. 이 기능의 용도가 애초에 가벼운 교정이라 손실 비용이 낮다). 제출 시점엔 archive하려는 옛 Digest가 여전히 `active`인지 확인하는 낙관적 동시성 체크를 거친다. 협업 중 다른 사람이 먼저 같은 Digest를 수정해 이미 archive됐다면 오류로 막고 새로고침 후 재시도를 유도한다(편집 내내 잠가두는 것보다 가벼운 절충이다). 새 Digest도, 그 `manual` changeset도 옛 Digest의 `sourceId`를 그대로 유지한다. 이래야 Source 완전 삭제 purge와 새 Digest 재추출이 `sourceId`로 바로 도달한다. 확정 전(`open` 초안 단계)의 편집은 이것과 별개다. 애초에 archive할 대상이 없는 첫 확정이라 이 절차가 필요 없다. Statement는 `manual`로 단독 archive("가리기")만 가능하고 create·재생성은 없다. Narration이 직접 인용하는 증거 단위라 Digest보다도 안 바뀌어야 할 이유가 더 크기 때문이다(다만 이 기능 자체는 아직 안 만들었다. 본문을 문장 단위로 보여주는 재설계가 먼저 필요해 다음 라운드로 미룬다). Relation은 독립적인 `manual` 교정이 없다. 틀린 관계는 대부분 relation 변경셋이 `closed`+`outcome: discarded`로 잡히고(`open` 단계에서 판정), 그 외엔 끝점 Statement archived의 캐스케이드로만 archived된다. Reference는 `create`·`modify`·`archive`를 다 쓴다. `modify`가 본질이다(계속 다듬어지는 게 존재 이유). `archive`는 정리용이다(더 이상 안 쓰는 엔트리를 접음, 과거 인용은 그대로 유효). `create`는 `ingestion`(정리 과정에서 엔진이 새 Reference를 뽑아낼 때)에서 일어난다. `modify`는 두 경로 모두에서 일어난다. 인제스천 중 기존 Reference가 다시 언급되며 새 정보가 생기면, 엔진이 "기존 설명 + 새 정보"를 녹인 완성본을 만들어 그대로 반영한다(게이트가 없어져 확정 전 사람이 다듬는 단계는 사라졌다). 이건 `ingestion` changeset의 일부로 반영된다(2026-07-15 도입). **Reference는 사람이 손대지 않아도 원문이 들어올 때마다 이렇게 계속 다듬어진다** — Digest가 확정 후 불변인 것과 달리, "쌓일수록 좋아진다"가 눈에 보이는 유일한 자리다. 그 외에 Reference 상세 화면에서 사람이 직접 편집하면 `manual`로 반영된다. `archive`는 `manual`(Reference 상세의 "아카이브")에서 일어난다. Reference의 과거 상태는 그 Reference를 대상으로 한 `manual` changeset들의 Change(`{ before, after }`)를 시간순으로 훑어 재구성한다(별도 버전 필드 불필요). "최종 수정 시각·수정자"도 이렇게 가장 최근 `manual` changeset의 `createdAt`·`authorId`에서 파생되는 값이지, Reference 자신의 필드가 아니다. Reference의 과거 Change에 남는 민감정보(사람이 직접 입력한 경우)는 별도 리댁션 메커니즘을 두지 않는다. git이 과거 커밋에 남은 평문 비밀값을 이력에서 지워주지 않는 것과 같은 이유다. 발생 확률 대비 복잡성이 안 맞는다.
- **Digest·Reference 직접 편집은 변경셋 목록에 안 뜬다.** `manual`은 모델(테이블·되돌리기 메커니즘)엔 `ingestion`·`relation`·`revert`와 똑같이 있지만, **화면만 다르다**. `ingestion`·`relation`·`revert` 셋은 전부 "엔진이 감지·제안했거나 사람이 이미 확정된 걸 되돌리는" **판정 대상**이라 `open`(대기)이라는 상태가 실제로 의미 있어 변경셋 목록에 뜨는 게 맞다. 반면 `manual`은 애초에 `open` 단계 자체가 없다. 만드는 사람과 확정하는 사람이 항상 같고, 만들어지는 순간 이미 끝나 있다(`Changeset.outcome` 참고). 그래서 변경셋 목록(변경셋 탭)은 `manual`을 걸러낸다. 대신 **Digest·Reference 자신의 상세 화면이 자신을 대상으로 한 `manual` changeset들을 조회해서 "버전 이력"으로 보여준다**(GitHub 위키 문서를 그 자리에서 편집·이력 보기 하는 것과 같은 결). "이 콘텐츠가 어떻게 여기까지 왔는지"를 알고 싶으면 변경셋 목록을 뒤지는 대신 그 콘텐츠 자체를 보면 된다. 아카이브 직후의 "다시 활성화"(surface-inventory.md 참고)도 새로운 메커니즘이 아니다. **그 자리에서 바로 그 `manual` changeset을 되돌리는(revert) 것**이다. 다른 모든 타입과 같은 되돌리기 메커니즘을 재사용하되, 진입 위치만 Changeset 상세가 아니라 그 콘텐츠의 상세 화면이다.
- **Topic·Tag와 Digest의 일부 필드, `referenceIds`는 changeset 없이 CRUD된다.** Topic·Tag는 `Change.targetType`에 없다. 판단·사실 콘텐츠가 아니라 찾기용 라벨이라 잘못 바뀌어도 판단을 오염시키지 않으므로, Changeset 리뷰·불변성 없이 가볍게 직접 CRUD한다(soft delete만 유지). 같은 이유로 `Digest`의 `topicIds`·`tagIds`·`relatedDigestIds`·`externalUrls` 필드도 changeset 없이 Digest 상세에서 직접 추가·삭제한다. Digest 본체(제목·본문·타입)는 확정 후 `create`·`archive`만 가능해도, 이 필드들은 Statement가 근거로 삼는 판단 내용이 아니라 찾기·참고용 메타라 예외로 둔다. `relatedDigestIds`는 특히 이 화면(Digest 상세)에서 사람이 직접 심는 게 아니다. 확정된 Digest의 2단계(Statement·Relation 생성)가 끝나면, 그 결과로 드러난 연결을 엔진이 자동으로 채워 넣는다. Thread(Topic 파생)와 달리 필드로 저장은 되지만, 사람이 판정하는 게 아니라 저장된 뒤에도 자유롭게 더하거나 뺄 수 있는 가벼운 참고 링크라 자동 채움이 원칙에 어긋나지 않는다. `referenceIds`는 이 예외에 없다. 본문 안 `@` 멘션이 유일한 인용 경로라서다(본문에 없는 걸 레퍼런스로 걸 수 없다. "지어내지 않는다"의 연장이다). 본문 문자열 자체가 바뀌는 것과 같은 조작이라, 본문 편집(archive+create)에 딸려서만 바뀐다. 별도의 레퍼런스 CRUD 화면·섹션은 없다. 본문 멘션 클릭이 곧 그 Reference로 이동하는 유일한 진입점이다.
- **Owner 0명 금지, 계정 삭제 시 소유권 이전 강제.** Space·Workspace는 항상 `owner` role인 Member가 최소 1명 있어야 한다(Slack·Notion 공통 원칙). User가 계정을 삭제하려는데 자신이 owner이고 다른 멤버가 있으면, 먼저 소유권을 다른 멤버에게 넘겨야 삭제가 진행된다(자동 승계 없음). 정말로 유일한 멤버라면 그 Space·Workspace 전체가 완전 삭제 캐스케이드를 탄다. 다른 멤버가 있는 곳에서 그냥 나가는(비-owner) 경우는 그 Member 행만 제거한다.
- **authorId는 사람 삭제와 무관하게 콘텐츠를 보존한다.** `Source`·`Digest`·`Changeset`의 `authorId`는 소유가 아니라 귀속(누가 만들었나) 정보일 뿐이다. User가 삭제돼도 `ON DELETE SET NULL`로 콘텐츠는 남고 귀속만 사라진다(공유 Space에서 다른 사람이 그 위에 쌓은 관계·판단을 보존하기 위함). `profiles`는 `ON DELETE CASCADE`다(이미 구현됨). `authorId`만 끊기면 "누가 만들었는지" 표시할 값 자체가 사라지므로, `authorId`를 채우는 시점에 그때의 표시 이름을 `authorName`에 함께 스냅샷해둔다 — `authorId`가 나중에 NULL로 끊겨도 `authorName`은 남아 화면에 계속 보여줄 수 있다. 계정이 살아있는 동안 이름을 바꿔도 과거 스냅샷엔 반영되지 않는다(라이브 조회가 아니라 생성 시점 고정값). `authorId`가 NULL이면(엔진 산물, 또는 계정 삭제로 끊긴 경우) `authorName`도 항상 짝을 맞춰 없거나 남는다 — `authorId`가 있는데 `authorName`만 없는 상태는 무효(DB CHECK로 강제).
- **ingestion 되돌리기는 파생 효과를 되돌린다(Reference 제외).** 확정 원문을 다시 `pending`으로 되돌리는 건 그 원문이 만든 ingestion Changeset을 되돌리는 것과 같다("원문 빼기"라는 말은 안 쓴다. `archive_source`가 이미 그 이름을 쓰고 있어 혼동된다 — 원문만 가리고 진술·관계는 안 건드리는 훨씬 좁은 동작이다. `mcp-tools-design.md`·`intervention-design.md` 참고). 그 Changeset이 만든 Digest·진술·관계는 함께 되돌아간다(archived, 끝점 archived의 관계 연쇄 포함). **Reference는 예외다.** Workspace 전체가 재사용하는 공유 자원이라, 이 changeset이 "만들었다"는 이유만으로 archive하면 다른 Digest가 그 뒤로도 계속 인용 중인 Reference를 감출 위험이 있다. 그래서 create→archive 방향은 건너뛴다(완전 삭제 purge가 Reference를 cascade 대상에서 뺀 것과 같은 판단, #366). 반대로 그 changeset이 Reference를 archive했던 경우(예: 사람이 직접 정리)는 archive→restore로 되살아난다. 공유 여부와 무관하게 안전한 방향이라서다. 재개는 처음부터 새로 인제스천하는 게 아니라, 확정됐던 그 콘텐츠(Digest·Reference)를 changeset 자신의 기록에서 그대로 복원한 draft로 다시 연다(LLM 재호출 없음) — 아래 "되돌리기는 재판정 초안을 새로 연다" 참고. 단순 soft-archive가 아니라 파생 효과를 되돌리는 동작이다.
- **끝점이 archived되면 관계도 연쇄로 archived된다.** 끝점 진술이 `archived`되면 걸린 관계도 함께 `archived`된다(연쇄 soft-archive). 끝점을 되살리면 관계도 돌아온다.
- **`mcpVisible`은 Digest에만 저장되고, 진술·관계는 조회 시점에 동적으로 상속한다.** Statement는 복사 저장 없이 매 조회 시 부모 Digest의 `mcpVisible`을 join해서 확인한다(값이 나중에 바뀌어도 즉시 반영되게 하기 위함). Relation은 양쪽 끝 Statement 중 하나라도 `mcpVisible=false`면 관계 자체도 `mcpVisible=false`로 취급한다. 두 진술이 각각 무해해도 그 둘을 잇는 선이 민감할 수 있다는 원칙이다. `10-concept-collaboration.md`가 접근(공유) 축에 이미 두고 있는 "관계는 끝점에 종속" 원칙을 그대로 재사용한다. **Reference는 이 상속 대상이 아니다.** Workspace 전체가 공유하는 사전이라, 그걸 언급한 Digest 하나가 `mcpVisible=false`라고 해서 그 개체 자체(이름·설명)까지 가릴 이유가 없다(가려야 하는 건 그 개체에 대해 뭐라고 썼는지이지, 그 개체가 존재한다는 사실이 아니다). 이 필터는 Statement를 실제로 반환하는 단일 조회 경로(choke point)에서 강제돼야 한다. 검색·관계 순회·Reference 경유·Space를 가로지르는 질의 등 모든 MCP 조회 경로가 이 경로 하나를 거치게 만들어, 경로별로 각각 필터를 구현할 필요가 없게 한다.
- **`mcpVisible=false` 콘텐츠 접근은 AccessLog로 남는다.** 같은 choke point가 필터링뿐 아니라 감사 로그도 함께 맡는다. `mcpVisible=false`로 걸러졌어야 할 콘텐츠가 별도 경로(게이팅 도구 등)로 실제 반환되는 순간, 누가·어떤 도구로·언제 접근했는지 그 자리에서 기록한다. 별도 감시 인프라 없이 choke point에 로깅 한 줄을 얹는 것으로 충분하다.
- **Digest가 사라질 때 relatedDigestIds를 정리한다: 대체가 있으면 치환, 없으면 제거.** 다른 Digest를 `relatedDigestIds`에 담고 있는데 그 대상이 사라지는 경우는 두 갈래다. **대체가 있는 경우**(수정 — archive+create)는, 옛 Digest를 담고 있던 다른 모든 Digest에서 그 항목이 새 Digest ID로 자동 치환된다(재검증 없이 단순 치환. `relatedDigestIds` 자체가 changeset 없이 가볍게 CRUD하는 참고용 메타라 이 정도 처리로 충분하다고 본다). 새 Digest도 옛 Digest의 `relatedDigestIds`를 그대로 물려받는다. **대체가 없는 경우**(수동 아카이브·ingestion 되돌리기로 인한 archive·완전 삭제)는, 셋 다 "새 버전 없이 그냥 사라지거나 가려짐"이라는 점이 같다. 치환할 대상이 없으니 그냥 그 ID를 제거한다. `archived` 상태인 Digest는 피드·검색·관련 Digest 자동 추천 등 모든 목록에서 제외된다(하드 삭제는 아니라 원칙상 되살릴 순 있지만, 지금 MVP엔 그럴 화면이 없다. 아래 "열어두는 것"의 `archived` 복구 화면 참고). 이 정리 규칙 덕에 애초에 archived·삭제된 Digest를 `relatedDigestIds`가 가리키는 상태 자체가 안 생긴다. **Thread는 이 제외 규칙의 예외다.** 아래 Topic 항목 참고.
- **변경셋 적용은 트리거마다 다르게 시작한다.** `ingestion`은 사람 확인 없이 곧바로 `closed`(`outcome: applied`)로 태어나고, 그 자리에서 Statement·Relation 생성(2단계)이 이어진다. **저장 전에 사람이 확인하는 게이트는 두지 않는다.** 그 게이트는 추출 품질이 나쁠 때를 대비한 보험이었는데, 켜두면 넣을 때마다 마찰을 내면서 정작 품질이 나쁘다는 사실은 사람이 매번 손으로 메워 안 드러나게 만든다 — 재는 대상을 가리는 장치였다. 잘못 정리돼도 원문은 그대로 박제돼 있어 빼고 다시 돌리면 되므로, 막아서 아끼는 비용도 거의 없다. 사람이 판정하는 자리는 넣는 시점이 아니라 **기존 것과 대조가 끝난 뒤**다(아래 모순·중복 항목). `manual`은 이미 사람이 확정한 단일 동작이라 곧바로 `closed`(`outcome: applied`)다. `revert`는 갈린다 — `ingestion`이나 `relation`(충돌·중복 판정)을 되돌리는 경우는 재판정이 필요해 `open`으로 새로 열리고(아래 "되돌리기는 재판정 초안을 새로 연다" 참고), 그 외(`manual`, 확신 관계 자동 적용)를 되돌리는 경우는 재판정할 게 없어 `manual`과 같이 곧바로 `closed`(`outcome: applied`)다. 2단계에서 관계 엔진이 새 Statement를 기존 것들과 대조한 결과는 `relation` 변경셋으로 나온다. 확신·비충돌 관계는 배치당 1개의 `relation` 변경셋이 곧바로 `closed`(`outcome: applied`)로 조용히 적용된다. 애매한 비충돌·비중복 관계는 changeset 없이 조용히 버려진다(편의 엣지 하나가 안 생길 뿐 아무것도 가려지거나 지워지지 않으니 사람이 볼 이유가 없다). 모순(`conflicts`)·같은 뜻의 중복(`duplicates`)인 쌍은 **쌍 하나마다** 별도의 `relation` 변경셋이 `open`으로 발생한다(쌍 N개면 changeset도 N개. 사람이 하나씩 판정하므로 한 changeset으로 묶으면 부분 판정을 표현 못 한다). open 제안은 활성 그래프 밖에서 대기하다 사람이 적용(`closed`+`outcome: applied`)하거나 버린다(`closed`+`outcome: discarded`). 모순·중복은 엔진이 잘못 판단하면 되돌리기 전엔 드러나지 않는 채로 진술이 사라지거나 잘못 엮이므로, 확신도와 무관하게 항상 사람 확인을 거친다. **판정 결과가 반영되는 단위는 진술이 아니라 Digest다.** 감지·비교는 지금처럼 진술(정확히는 Digest의 어느 칸)까지 정밀하게 하되 — 통째로 견주면 "이유는 같은데 선택이 다르다"를 못 잡는다 — 판정으로 지난 것이 되는 대상은 그 진술이 속한 Digest 전체다. 화면에서 진술을 개념으로 드러내지 않기 때문이다(사람이 배우는 개념은 Digest·Topic·Reference 셋뿐이고, Digest는 살아있는데 그 안 한 줄만 접힌 상태는 표현할 방법이 없다). 원문은 이미 판단 유형별로 쪼개져 Digest가 되므로 Digest 하나가 대체로 판단 하나에 가까워, 통째로 접혀도 잃는 게 크지 않다. 판정이 너무 뭉뚱그려진다고 느껴지면 꺼낼 카드는 "진술을 화면에 드러내기"가 아니라 **"Digest를 더 잘 쪼개기"**다 — 정밀도 개선이 엔진 품질 문제로 남고 개념 수를 늘리지 않는다.
- **레퍼런스·주제·태그는 병합을 고려하지 않는다.** 중복 병합(`duplicates`)은 Statement 전용이다. Reference·Topic·Tag는 Source→Digest·Reference 변환 시 이미 레지스트리에 등록된 것과 매칭해 인용을 제안하므로, 애초에 같은 대상이 중복 생성되는 경우가 최소화된다. 매칭이 안 되면(협업 확장 시 Space 권한이 갈리는 경우 등) 병합 대신 중복을 그대로 허용한다.
- **한 Digest가 여러 곳과 동시에 중복될 수 있다. 먼저 처리된 쪽이 나머지를 무효화한다.** 새 Digest B가 기존 A1·A2 둘 다와 중복 감지되면 (A1,B)·(A2,B) 각각 별도 `relation` 변경셋이 열린다(쌍 하나마다 규칙 그대로). 그중 하나(예: A1,B)가 먼저 병합 확정되면 B의 Digest는 archive되고, 그 원문은 재비교 대상이 된다(conflicts의 "진 Digest를 나중에 수정하면" 항목과 같은 archive+재비교 메커니즘이다. 새로 생긴 병합 Digest가 A2와 다시 대조되어, 필요하면 새 `relation` 변경셋이 자동으로 뜬다). 이 시점에 (A2,B)는 이미 없어진 B를 대상으로 하므로 자동으로 `closed`+`outcome: discarded`가 되지만, **일반적인 discarded("사람이 이건 중복이 아니라고 판단함")와는 뜻이 다르다.** 판단이 틀린 게 아니라 대상이 사라져 무효화된 것이다. 그래서 Changeset 상세에 보여줄 문구는 구분해야 한다("B가 다른 병합(A1)으로 먼저 처리되어 이 판정은 더 이상 유효하지 않음" 등). 자동으로 닫혀도 "사람이 판정한다" 원칙과는 안 부딪힌다. 이 원칙은 콘텐츠 내용의 옳고 그름을 자동 판단하지 말자는 것이지, "B가 물리적으로 더 이상 존재하지 않는다"는 사실 확인까지 사람이 눌러야 한다는 뜻은 아니다(GitHub이 base 브랜치가 지워진 PR을 자동으로 머지 불가 처리하는 것과 같은 성격이다). **실제 사용자 경험상 이게 헷갈리지 않을지는 아직 검증 전이다.** 표면 설계·실사용에서 확인이 필요하다.
- **`open`은 확정 전 초안이다.** `open` 상태인 changeset의 `changes`는 확정 전까지 사람이 자유롭게 고쳐 쓸 수 있는 초안이다(relation 제안 판정 시 제안된 관계·병합 초안을 다른 내용으로 바꾸는 것이 여기 해당). `ingestion`은 `open`을 거치지 않으므로 이 규칙의 대상이 아니다. `closed`로 전환되는 순간(`outcome`이 뭐든) 그 시점 내용으로 고정된다.
- **되돌리기는 append-only다.** `closed`(`outcome: applied`)를 되돌릴 땐 status를 바꾸지 않고, 원본을 가리키는 revert 변경셋을 *추가*한다. "되돌려졌나"는 그 존재로 파생된다(폐기를 `replaces`에서 파생시킨 것과 같은 방식). 되돌림의 되돌림(redo)도 revert를 또 추가하면 된다.
- **되돌리기는 재판정 초안을 새로 연다(relation 판정에 한해).** 되돌리는 대상이 `relation`(충돌·중복 판정, 확신 관계 자동 적용은 제외)이면, 원본은 `closed`로 그대로 두고 새 revert 변경셋이 `open`으로 태어난다 — 이 행 자체가 곧 재판정 화면이다(확정하면 편집된 내용이 다시 적용되고, 버리면 되돌려진 상태 그대로 남는다). 복원 콘텐츠는 changeset 자신의 기록에서 그대로 가져오지 LLM을 다시 부르지 않는다 — 엔진의 원래 제안(duplicates면 병합 초안까지)을 새 draft로 복원한다. 그 외(`ingestion`, `manual`, 확신 관계 자동 적용)를 되돌리면 재판정할 게 없어 곧바로 `closed`(`outcome: applied`)다. **`ingestion` 되돌리기가 여기서 빠진 건 게이트 제거의 결과다** — 확정 전 단계가 없으니 되돌릴 판정도 없다. 되돌리면 원문이 `pending`으로 돌아가고, 다시 정리하고 싶으면 초안 목록에서 재추출한다. 되돌리기 버튼은 "지금 그래프에 살아있는 걸 만든 행"에만 붙는다 — 되돌려진 원본은 버튼을 잃고 새로 열린 재판정으로 가는 링크가 뜨며, 그 재판정이 확정되면 버튼이 그쪽(새로 만들어진 changeset)으로 옮겨간다. 재판정 초안을 버리면 기존 "버려짐을 되살릴 땐 in-place로 처리한다" 경로로 복구할 수 있다(`ingestion` 쪽은 대신 초안 목록에서 재추출해도 된다 — 먼저 하는 쪽이 이기고, "같은 Source에 열린 리뷰 2개 금지" 가드가 나머지를 막는다).
- **버려짐을 되살릴 땐 in-place로 처리한다.** `applied`를 되돌리는 것과 달리, `closed`(`outcome: discarded`)를 되살릴 땐 새 changeset을 만들지 않고 **같은 changeset의 status를 그냥 `open`으로 되돌린다**(GitHub이 merge된 PR은 revert로 새 PR을 만들지만, merge 없이 닫힌 PR은 그냥 같은 PR을 reopen하는 것과 같은 구분이다. 닫힌 목록에서 조용히 빠지는 것도 동일하다). `discarded`는 실제로 아무 일도 일어나지 않은 상태라 append-only로 보존할 "일어났던 사실"이 없다. 판단 콘텐츠를 가리는 것도 아니라 "충실함" 원칙과도 부딪히지 않는다. 되살리기가 가능한 조건은 그 changeset의 `sourceId`가 가리키는 Source가 지금 `pending`이고, 그 Source에 현재 `open`인 ingestion changeset이 없을 때뿐이다(이미 다른 시도로 `active`가 됐거나 이미 열려있는 리뷰가 있으면 막는다. 같은 Source에 리뷰가 동시에 여러 개 생기는 걸 방지한다).
- **`authorId`는 사람이 *직접 만든 것*에만 붙는다.** 원문(제공)·Digest(제공, `Source.authorId`를 승계)가 여기 속한다. Changeset의 `authorId`는 사람이 그 changeset의 *내용 자체*를 만든 경우에만 붙는다. `manual`·`revert`가 여기 속한다(각각 편집 제출 버튼·되돌리기 버튼을 사람이 직접 눌러 그 순간 확정하는 단일 동작이라 내용도 사람이 정한다). `ingestion`은 얼핏 사람이 트리거한 것 같지만(Source 제출), changeset의 구체적 내용(Digest 몇 개로 나뉘는지·제목·Reference 후보 등)은 엔진이 만든 것이라 `relation`과 같은 엔진 산물로 취급한다(`authorId` 없음. surface-inventory.md 참고). 진술·관계 자체(Statement·Relation)에도 없다. 소유·출처는 `digestId` → `Digest.authorId`로 파생된다. 있으면 사람, 없으면 엔진이다.
- **참·거짓은 판단하지 않는다.** 시스템은 진술의 진위를 가리지 않는다. 진술의 유효함은 *존재 + 대체(`replaces`·`duplicates`) 관계 없음*으로 정해지고, 모순은 `conflicts`로 드러내되 어느 쪽이 옳은지는 사람이 정한다. "언제부터 참인가" 같은 시간 표현은 진술 내용에 담겨 읽기 시점에 풀린다. 시스템이 "지금 유효한가"를 기계적으로 계산하는 동작이 없으므로 별도 시각 필드를 두지 않는다.
- **오래된 미결·가정은 나이 기반으로 서피싱한다(진위 판단 아님).** `pending`·`assumption` 타입 Digest가 `createdAt` 기준 일정 기간(타입별 고정 상수)이 지나도록 `resolves` 관계로 이어지지 않고 `active` 상태로 남아 있으면 "오래됨" 신호가 붙는다. 위 "참·거짓 미판단" 원칙과 안 부딪힌다. 내용이 틀렸다고 판단하는 게 아니라 "손 안 댄 지 오래됐다"는 순수 경과 시간 신호일 뿐이고, 실제 판단(아직 유효한지·이제 안 중요한지)은 여전히 사람이 한다. `resolves`로 연결되거나 사람이 직접 archive하면(무시) 신호는 그 조건을 다시 계산하는 것만으로 자연히 사라진다. 별도의 "해소됨"·"무시됨" 상태를 새로 만들지 않는다. 신호는 조건이 참인 동안 항상 보이는 상태 표시일 뿐이라 별도의 재알림 주기 개념이 없다. 명시적으로 무시(archive)하지 않는 한 계속 그 자리에 남는다.
- **미결·가정 해소 작성은 `manual`의 "새 Digest 직접 생성"이다.** 지금까지 `manual`은 기존 Digest·Reference를 "수정"(archive+create 또는 in-place)하는 것만 다뤘는데, 여기서는 대상 없이 완전히 새로운 Digest를 직접 만드는 첫 사례다. 미결·가정 Digest 상세의 "해소 작성" 진입점(나이·오래됨 여부와 무관하게 항상 노출)에서 시작하면, 그 대상이 무엇을 해소하는지 이미 정해진 채로 문서형 편집 폼이 열린다. 제출 즉시 `closed`+`outcome: applied`로 확정된다(`manual`의 기존 규칙 그대로). 한 changeset 안에 `digest: create`(새 Digest)·`statement: create`(추출)·`relation: create`(`type: resolves`, 대상 확정)가 함께 묶인다. Changeset이 원래 "여러 변경을 한 번에 묶는 단위"라는 정의를 그대로 쓸 뿐, 새 원시 개념은 필요 없다. 다만 이 새 진술도 나머지 활성 그래프와는 평소처럼 대조된다(2단계 관계 형성 재사용). `resolves` 링크만 확정돼 있을 뿐, 이 내용이 다른 진술과 우연히 겹치거나 부딪히는 것까지 막지는 않는다.
- **Topic은 엔진이 붙이고, 새로 만드는 걸 아낀다.** 사람이 매번 고르지 않는다 — 그러면 정리 부하가 사람에게 되돌아온다. Space별 레지스트리로 영속해 재사용되고, 같은 Topic이 붙은 Digest들이 다시 켰을 때 하나의 Thread로 모인다. 규칙은 넷이다. ① **새로 만들 땐 그 원문의 화제보다 한 단계 넓은 이름으로 짓는다**(예: "채널 우선순위를 뒤집은 논의" → "AI 마케팅 기획"). 인제스천 시점의 엔진은 원문 하나만 보므로 "쌓인 것에 비추어 적절한 굵기"를 판단할 수 없지만, 한 단계 추상화하는 건 원문 하나로도 된다. ② **기존 Topic에 붙이는 게 기본값이고, 새로 만드는 건 정말 맞는 게 없을 때뿐이다.** 굵기는 지시해서 얻는 게 아니라 이 인색함의 결과로 자란다. ③ **엔진은 이름을 사후에 바꾸지 않는다.** 어제 본 줄기 이름이 오늘 달라지면 "쌓일수록 믿게 된다"가 깨진다(사람이 직접 고치는 건 자기가 한 일이라 해당 없음). ④ **Digest 하나에 Topic 하나. 미부착은 허용하지 않는다.** 여러 개를 허용하면 ②의 "붙일 만하면 붙인다"와 겹쳐 모든 Digest가 모든 Topic에 걸리는 쪽으로 흘러 줄기 구분이 사라진다. 그리고 Topic 목록이 유일한 탐색 축이므로, Topic이 안 붙은 Digest는 지워지지도 않은 채 어느 화면에도 안 나타난다 — 그래서 떼기는 없고 바꾸기만 있다. 치우고 싶으면 archive한다. 같은 이유로 "미분류" 묶음도 두지 않는다. 그 자리는 ②의 "새 Topic 만들기"가 이미 채우고 있고, 이름이 있는 쪽이 낫다(나중에 비슷한 게 들어오면 거기 붙지만, 미분류 더미는 아무것도 모으지 못한다).
- **Thread는 archived Digest도 원래 시간 순서 자리에 접힌 채로 보여준다.** Digest 수정(archive+create)이나 duplicates 병합처럼 "옛 Digest archive + 새 Digest create"로 처리되는 변경은, 다른 목록(피드·검색 등)에서처럼 옛 Digest를 완전히 감추면 Thread가 "그 시점에 실제로 뭐가 있었는지"를 보여주지 못하게 된다. 그렇다고 기본으로 다 펼쳐서 보여주면 반복적으로 수정·병합된 Topic은 지난 버전들로 지저분해진다("다시 읽는 수고를 없앤다" 원칙과 부딪힌다). 그래서 Thread 안에서 archived Digest는 **원래 있던 시간 순서 그 자리에, 접힌 얇은 표시로만** 남고, 펼쳐야 전체 내용이 보인다(원문 대조·긴 Reference 설명에 이미 쓴 "하이라이트 주변만 기본, 전체는 펼치기" 패턴과 같다). 새로 만들어진 Digest는 자기 `createdAt`(지금) 기준 자리에 별도로 나타난다. 즉 원문 자리엔 접힌 옛 버전이, 최신 자리엔 새 버전이 둘 다 보인다. 어느 한쪽으로 옛 버전을 흡수·이동시키지 않는다(순서를 안 흔드는 대신 두 자리에 나눠 보여주는 절충이다).
- **완전 삭제는 trashed 상태에서 배치로 purge된다.** `trashed`는 사용자가 명시적으로 삭제를 선택했다는 신호이고(soft archive와 달리 무기한 보존이 아니다), `trashedAt` 이후 보관 기간(30일)이 지나면 매일 도는 배치(pg_cron)가 완전 삭제를 실행한다(#363). **원문을 DELETE 한 번 하면 나머지는 FK cascade로 자연 삭제된다.** 원문→Digest→진술→관계(`statement_relations.from_id`·`to_id`) 전체 체인이 `ON DELETE CASCADE`라, 파생물(Digest·진술·관계·그 원문의 changeset)이 원문 소속 cascade로 한 번에 깨끗이 정리된다(changeset을 `sourceId` 기준으로 훑어 `create`·`modify`를 손으로 되돌리던 원래 설계는 `sourceId` 없는 changeset을 놓치는 구멍이 있어 폐기했다). 관계가 **다른(살아있는) 원문**의 진술과 걸려있었어도 이 cascade가 그대로 처리한다. 관계 테이블의 FK가 두 끝점 모두 CASCADE라, 한쪽 진술이 지워지면 그 관계 행 자체가 자동으로 같이 지워진다(고아 행·FK 위반 걱정 없음). **Reference는 cascade 대상이 아니다.** Workspace 공유 자원이라 다른 원문이 인용 중일 수 있어, 한 원문 삭제로 지우면 안 된다(create·modify 구분 없이 그냥 안 건드린다). 진술 hard delete로 고아가 되는 Qdrant 임베딩은 같은 트랜잭션에서 `vector_purge` 큐로 넘겨 워커가 정리한다.

  **컴플라이언스 관점에서는 이 cascade만으론 부족하다.** `relation`(충돌·중복) changeset은 그 판정 시점 콘텐츠를 `Change.data`에 스냅샷으로 얼려서 보관한다(git이 옛 커밋을 그대로 보여주는 것과 같은 원리). 그런데 그 changeset의 `sourceId`는 판정을 촉발한 **새** 원문이지, 지워지는 원문이 아닐 수 있다. 지워지는 원문 X의 진술이 나중에 들어온 원문 Y의 진술과 충돌·중복 판정이 붙었다면, 그 changeset은 Y 소속이라 X를 purge해도 안 지워지고, X 진술의 전체 내용이 그 안에 스냅샷으로 그대로 남는다. 이건 백업처럼 죽은 데이터가 아니라 **Changeset 상세 화면을 열면 실제로 보이는, 살아있는 제품 표면**이라 방치할 수 없다. 그렇다고 cascade 범위를 "이 콘텐츠를 참조하는 모든 곳"으로 넓히면 파급이 얼마나 커질지 모르는 위험한 연쇄가 된다. 그래서 범위를 넓히지 않고 다음처럼 좁게 처리한다. purge 대상 Digest·진술 ID 목록은 이미 정확히 알고 있는 유한한 집합이므로, 이 ID들을 스냅샷으로 담고 있는 **다른 원문 소속** `relation` changeset을 그 ID 기준으로만 찾아, changeset 구조(배지·시각·판정 결과라는 사실 자체)는 남기고 **콘텐츠 필드만 삭제 표시로 치환**한다. 그래프를 훑는 새로운 연쇄가 아니라, 이미 사람이 무거운 확인을 거쳐 확정한 삭제 행위의 후속 처리다. Reference는 이 처리에 포함하지 않는다. Reference는 `relation`(충돌·중복) 대상이 아니라서(Statement 전용) 이 문제 자체가 안 생긴다. Reference 자신의 완전 삭제는 아래 별도 규칙을 따른다.

- **Reference 완전 삭제는 Source처럼 독립적인 `trashed`→30일→배치 purge를 따른다. 확인 무게는 인용 여부로 갈린다.** Reference는 Digest와 달리 기댈 부모(Source)가 없다(여러 Source·ingestion에 걸쳐 계속 재사용되는 Workspace 공유 자원이라서다). 그래서 완전 삭제도 다른 무언가에 얹혀가는 게 아니라 그 자체로 독립된 플로우다. 이건 **Source 단위** purge 얘기다. 다른 Source가 아직 그 Reference를 쓰고 있을 수 있어서 제외되는 것이다. **Workspace 전체**가 삭제되는 경우(계정 삭제로 유일 멤버 Workspace가 통째로 사라질 때 등)는 다르다. `references.workspace_id`가 `ON DELETE CASCADE`라 그 안의 Reference도 Workspace와 함께 자동으로 삭제된다(`delete_workspace` RPC). **확인 UI 무게는 인용 중인 Digest 수(N)로 갈린다.** Reference 상세에 이미 있는 "인용하는 Digest (N)" 카운트를 그대로 재사용한다. N=0이면 가벼운 버튼 확인, N>0이면 Space·Workspace급의 "이름 타이핑" 확인이다(그 아래 인용 중인 Digest 목록도 같이 보여준다. "조용히 덮지 않는다"). **인용하는 Digest를 미리 정리하라고 막지는 않는다.** 컴플라이언스처럼 지체 없이 처리해야 하는 요청을, 인용 정리(각 Digest를 archive+create로 무겁게 고쳐야 함)에 막아두면 안 된다는 판단이다. 삭제 확정 후 그 Digest들 본문의 멘션은 죽은 링크 표시로 남는다.

  **확인 무게와 유예 기간은 서로 다른 문제를 막는 장치라, 하나가 다른 하나를 대체하지 않는다.** 타이핑 확인은 "실수로 눌렀다"(오클릭)를 막고, 유예 기간은 "의도적으로 눌렀지만 틀렸다"(후회·성급함·악의)를 막는다. 그래서 확인이 무거워도 유예 기간은 그대로 준다. Source·Space·Workspace와 똑같이 `trashed` 30일 뒤 배치 purge다(Space·Workspace 완전 삭제도 삭제 메커니즘 자체는 Source의 완전 삭제를 부채꼴로 재사용하므로, 이미 이 패턴을 쓰고 있다). 확인 즉시 `trashed`로 전환되며 검색·멘션 매칭 등 모든 표면에서 즉시 빠진다(archived보다 강하게 숨는다). 컴플라이언스가 요구하는 "즉시 노출 중단"은 이 시점에 이미 만족되고, 지연되는 건 물리적 삭제뿐이다.

  **배치 purge 시점 정리는 이렇다.** Reference 자신의 `manual` changeset(수정·아카이브 이력)은 통째로 같이 지운다. 오직 이 Reference만을 위해 존재하고 다른 어떤 살아있는 엔티티의 서사도 여기 안 걸려있기 때문이다. 반면 **이 Reference를 처음 만든 `ingestion` changeset은 통째로 못 지운다.** 같은 배치에서 나온 다른(살아있는) Digest·Reference도 같이 기록하고 있을 수 있어서, 위 Digest 완전 삭제와 같은 방식으로 **이 Reference 몫의 스냅샷 필드만 삭제 표시로 치환**한다. `relatedReferenceIds`도 Digest의 `relatedDigestIds`와 같은 이유로 정리가 필요하다. Reference는 수정이 archive+create가 아니라 in-place `modify`라 ID가 안 바뀌므로 "치환" 케이스 자체가 없고, 참조하던 Reference가 archived·trashed되면 그냥 그 ID를 제거하는 것뿐이다.

  **되돌리기(revert, 확정 원문을 pending으로 되돌리는 일반 플로우)는 이 purge와 별개다.** purge는 `trashed` 30일 뒤 하드 삭제, revert는 위 "되돌리기는 append-only다" 원칙대로 soft archive다.

## 열어두는 것

- AccessLog를 보여주는 화면. 모델(테이블·기록 시점)은 이번에 정리했지만, 유저가 이걸 어디서·어떤 형태로 확인하는지(Digest 상세에 붙일지, 별도 화면을 둘지)는 표면 설계 단계에서 정한다.
- Reference·Digest 버전 이력의 표면. 둘 다 자신을 대상으로 한 `manual` changeset들의 Change 기록으로 체인이 연결되지만(모델은 확정), 상세 화면에서 그 이력을 어떻게 나열해 보여줄지(둘을 같은 자리·형태로 통일할지)는 표면 설계 단계에서 정한다.
- 원문 실제 시점(발생·작성). `createdAt`(시스템에 들어온 때)과 별개인 실제 발생·작성 시각이다. 소급 입력 등에서 문제되면 추가한다.
- 공유·그룹·세부 권한 *규칙*. 협업 단계에서 정한다. 소유·멤버십의 자리(Space=콘텐츠 그릇, Member=사람 묶음)는 오늘 확정했으니 재설계 없이 멤버 추가만으로 확장 가능하다. Group·세밀한 공유 축은 `10-concept-collaboration.md`에 개념만 있고 아직 스키마 반영 전이다.
- Workspace 완전 삭제의 확인 UX. Space는 이미 구현됐다(`SpaceDeleteConfirmForm.tsx`). Workspace는 계정 삭제 흐름에 얹혀서만 처리되고(유일 멤버인 경우 `delete_workspace` 캐스케이드), 독립된 "워크스페이스 삭제" 확인 화면은 아직 없다. 표면 설계 단계에서 정한다.
- 원문 에셋(음성·이미지·파일)·`Locator` 형식. body 외 원재료 묶음은 추후 다룬다. 다만 연속된 범위 하나가 아니라 **다중 범위**를 가리킬 수 있어야 하는 건 확정이다(한 Digest가 원문 여기저기 흩어진 내용을 종합하는 경우 대비. 판정 화면의 원문 대조 하이라이트도 이를 가정하고 설계됐다). 구체적 형식만 추후 정한다.
- 전사·OCR 주체. 누가 텍스트로 변환하나(입력 경계)는 아직 안 정했다.
- Topic·Tag·Reference의 `archived` 복구 화면. 원칙상 되살릴 수 있어야 하는데, Topic·Tag는 전용 목록 화면 자체가 표면인벤토리에 없어 복구할 자리가 없다(Topic·Tag는 Digest 상세에서 칩으로 직접 추가·삭제만 가능하다). Reference는 "Reference 목록"이 있어 필터만 추가하면 되지만 명시된 건 아니다.
- Digest·Reference 완전 삭제 트리거·확인 UI, changeset 콘텐츠 치환 구현. 모델 레벨 설계는 이번에 정리했다(Digest 단독 완전 삭제는 지원 안 한다. Digest 안 민감정보는 원문에도 있어 원문째 purge해야 실효가 있다. Reference는 독립적인 `trashed`→30일→배치 purge이고, 확인 무게는 인용 중인 Digest 수로 갈린다. 위 "완전 삭제" 참고). 다만 실제로 구현된 건 없다. ① 컴플라이언스 삭제 요청은 지금 있는 "trashed→30일→배치 purge" 셀프서비스 플로우로 충분한지, 즉시 처리(관리자 개입) 경로가 따로 필요한지는 아직 안 물어봤다. ② 다른 원문 소속 `relation` changeset·Reference 생성 `ingestion` changeset의 `Change.data` 콘텐츠 치환은 설계만 됐고 실제 쿼리·트랜잭션은 안 짰다. ③ Reference 완전 삭제 트리거 UI(미트볼 메뉴 등)와 인용 카운트 기반 확인 무게 분기는 와이어프레임에 아직 없다.
- Digest·Reference "특정 버전으로 복원"(Notion Version history의 Restore 같은 기능). MVP는 안 다룬다. 넣게 되면 새 메커니즘이 아니라, 기존 "편집"(archive 현재+create 새 버전)에 옛 버전 필드값을 미리 채워 넣는 진입점 정도로 모델링하면 될 것 같다. 그러면 지금 수정에 이미 붙어있는 캐스케이드(`relatedDigestIds` 치환, 새 Statement 추출→2단계 재판정)를 그대로 물려받아 새 changeset 타입이 필요 없다. 사이드 이펙트(복원 후 새로 감지될 충돌·중복)는 커밋 전에 완전히 예측할 방법이 없다. 관계 엔진의 판정 자체가 원래 비동기·확률적이라 신규 ingestion·일반 수정도 똑같이 가진 한계다. 커밋 전에 보여줄 수 있는 최대치는 콘텐츠 레벨 diff뿐이고(변경 이력 모달이 이미 이 역할), 캐스케이드는 커밋 후 평소처럼 "리뷰 대기"로 뜨는 걸로 충분하다고 본다. Notion처럼 원클릭으로 안 두고 지금 편집과 같은 무게의 확인 모달을 거치게 해야 한다(Notion 페이지엔 이런 캐스케이드가 없어 원클릭이 가능한 것이다).

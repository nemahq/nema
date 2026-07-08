# 모델링

## Source

시스템이 손대지 않고, 사람이 작성한 그대로 박제하는 원재료. 의미로 다뤄지지 않는다. Digest가 여기서 만들어진다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `spaceId` | `uuid` | 어느 Space에 제출됐나 |
| `title?` | `string` | 원본을 식별하는 짧은 이름. 외부 연동(Gmail Subject, Tiro 회의 제목 등)은 그 시스템이 이미 준 값을 그대로 매핑한다. 직접 타이핑·붙여넣기처럼 자연히 제목이 없는 입력은, 제출 즉시(1단계 Digest 추출보다 먼저) 엔진이 원문을 보고 빠르게 채운다 — 넣기 자체는 SNS 포스팅처럼 제목 필드 없이 가볍게 유지(가벼운 캡처 원칙)하면서도, 원문 탭·초안 목록 등에서 스니펫 대신 보여줄 이름을 확보한다. `open` 상태인 ingestion changeset이 아직 없는 동안(= 초안에 머무는 동안)만 사람이 직접 고칠 수 있고, 리뷰가 시작되면(open ingestion changeset 발생) 잠긴다 — Changeset.title이 그 시점부터 화면의 주된 편집 가능한 제목 역할을 대신하므로, 동시에 편집 가능한 제목이 두 개가 되는 걸 피한다 |
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
| `createdAt` | `Date` | 만들어진 때 |
| `status` | `enum: active / archived` | 존재 상태 |

## Changeset

한 번의 변경(원본 인제스천·충돌 해결·합치기·수동 편집·되돌리기)을 묶는 단위. 진술·관계의 생성·제거를 묶어 리뷰·되돌리기·이력으로 다룬다. 검토 흐름이 개별 진술·관계가 아니라 이 묶음에 붙는다 — GitHub의 커밋/PR과 같은 자리다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자(내부용) |
| `number` | `int` | Space 안에서 순차 증가하는, 사람이 읽고 지칭하기 위한 번호(GitHub의 PR·이슈 번호와 같은 역할) — `id`(uuid)는 내부 식별자일 뿐이고, 화면에 노출하고 "체인지셋 #12"처럼 대화에서 지칭하는 건 이 값. `title`은 편집 가능해 안정적인 앵커가 못 되지만 이 번호는 안 바뀜 |
| `type` | `enum: ingestion / relation / manual / revert` | 무엇이 일으킨 변경인가. `relation`은 관계 엔진이 만든 변경. 모순·중복 같은 관계의 *종류*는 changeset이 아니라 `Relation.type`(conflicts/duplicates)이 구분한다 — changeset 레벨에서 또 나누면 같은 정보를 두 군데 적는 중복 축이라 conflict/merge 타입은 두지 않는다 |
| `title` | `string` | 목록·리뷰 화면 헤더에 쓰는 제목 — 초기값은 엔진이 생성 시점에 채우고(PR 제목처럼 매번 파생 계산하지 않고 저장된 값을 그대로 읽음), 그 뒤로는 사람이 리뷰 화면에서 직접 고쳐 쓸 수 있다(제안은 엔진이, 수정은 사람이 — GitHub도 PR 제목을 커밋 메시지 등에서 자동 채우지만 항상 편집 가능한 것과 같은 이유). Optional 아님 — 타입 무관하게 항상 값이 있어야 변경셋 탭 목록이 일관되게 렌더링됨. 타입별 초기값 생성 규칙: `ingestion`은 엔진(LLM)이 **원문 전체**를 보고 생성한다 — 결정·미결·학습·아이디어·가정처럼 서로 다른 타입의 Digest 여럿을 낳는 상위 단위는 그 개별 판단들이 아니라 그것들이 나온 대화·논의 자체이기 때문. 여러 Digest가 같은 주제를 공유하면 자연스럽게 그 주제가 제목이 되고(예: 한 CS 정기 싱크에서 "결정"과 "미결"이 하나씩 나왔다면 "CS 채팅 UX 개선"), 서로 다른 주제가 섞여 있으면 LLM이 전체를 아우르는 요약형 제목("~에 대한 논의" 등)을 알아서 만든다 — Topic 일치 여부로 분기하는 규칙을 애플리케이션 코드에 따로 둘 필요는 없다(대표 Digest 제목 기계적 조합이 아니라 매번 LLM 판단). `relation`은 부딪히거나 중복되는 Statement 내용 요약("A vs B", 구체적 종류는 `Relation.type`이 구분), `manual`은 대상 Digest 제목("수정: OO"), `revert`는 되돌리는 대상 changeset의 title을 참조 |
| `status` | `enum: open / closed` | 변경셋 생애(진행 중인지 끝났는지만). 되돌림은 revert 변경셋으로 파생 |
| `outcome?` | `enum: applied / discarded` | `closed`일 때만 의미 있음 — 어떻게 끝났는지. `status`(끝났는지)와 `outcome`(어떻게 끝났는지)을 필드로 분리해 한 값이 두 질문을 겸하지 않게 한다. `applied`는 확정. `discarded`는 적용하지 않고 닫힌 것 — `relation`에서는 사람이 제안(충돌·중복)을 거절한 경우(행으로 남아 재제안 가드가 봄), `ingestion`에서는 사람이 리뷰를 버린 경우(하드 삭제 대신 이 값으로 남겨 실수로 버린 것도 되살릴 수 있게 함) — 이유는 다르지만 "적용 안 하고 닫혔다"는 같은 상태라 값을 공유한다. `manual`(Digest·원본 수정)은 이 값을 안 쓴다 — 아래 참고, 제출 시점에만 changeset이 생겨 늘 `applied`로 시작한다 |
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

`source`·`digest`·`statement`·`relation`은 `create`/`archive`만 — 확정 후 불변이라 `modify` 없음. `source`는 archive 후 새로 create하는 것을 "원본 수정"으로 편의 노출한다(`manual` changeset) — 이건 Source→파생물 전체가 재인제스천되는 무거운 동작이라는 걸 사용자가 감수하는 명시적 선택이다. `digest`도 확정(active) 후 같은 방식의 "Digest 수정" 편의 기능을 갖는다(`manual` changeset) — Statement가 이미 그 Digest를 안정적 근거로 참조하고 있어서 Digest만 콕 집어 고치면 그 위에 쌓인 관계·판정이 고아가 될 수 있지만(Source 레벨 되돌리기가 겪는 문제를 한 단계 아래서 반복), 이건 Source 레벨 수정에서도 이미 감수하기로 한 같은 위험이고, Digest 레벨은 오히려 더 정밀하다(한 Source에서 나온 다른 형제 Digest는 안 건드림). Digest 상세 화면에서 본문(제목·요약·본문·타입) 영역의 "편집"을 누르면 그 자리에서 인라인으로 편집 모드가 열리지만(GitHub 이슈 본문처럼 화면 이동 없이), 이 시점엔 아직 changeset이 생기지 않는다 — 편집 중인 내용은 클라이언트 상태로만 가볍게 존재한다(서버에 별도 changeset을 미리 persist하지 않는다). "제출"을 누르는 순간에야 `manual` changeset이 만들어지고 곧바로 `closed`+`outcome: applied`로 확정되며(그 changeset은 `open` 단계를 거치지 않는다), 그 안에서 옛 Digest의 archive와 새 Digest의 create가 동시에 적용된다. "취소"하거나 그냥 화면을 나가면 로컬 상태만 사라질 뿐 서버엔 아무 흔적도 안 남는다 — 아직 아무것도 안 바뀐 상태라 되살릴 대상 자체가 없다(브라우저가 죽어서 미완성 편집을 잃는 정도는 감수한다 — 이 기능의 용도가 애초에 가벼운 교정이라 손실 비용이 낮다). 제출 시점엔 archive하려는 옛 Digest가 여전히 `active`인지 확인하는 낙관적 동시성 체크를 거친다 — 협업 중 다른 사람이 먼저 같은 Digest를 수정해 이미 archive됐다면 오류로 막고 새로고침 후 재시도를 유도한다(편집 내내 잠가두는 것보다 가벼운 절충). 새 Digest도, 그 `manual` changeset도 같은 `sourceId`를 유지한다 — `manual`의 `source_id NULL` 제약을 풀어 Digest 수정본이 원본에 매이게 했다(Reference 수정처럼 원본과 무관한 `manual`만 `source_id`를 비운다). 이래야 Source 완전 삭제 purge와 새 Digest 재추출이 `source_id`로 바로 도달한다 — 수동 수정이라는 출처는 `source_id`(어느 원본인지)가 아니라 `type: manual`이 구분한다. 확정 전(`open` 초안 단계)의 편집은 이것과 별개로, 애초에 archive할 대상이 없는 첫 확정이라 이 절차가 필요 없다. `statement`는 `manual`로 단독 archive("가리기")만 가능하고 create/재생성은 없다 — Narration이 직접 인용하는 증거 단위라 Digest보다도 안 바뀌어야 할 이유가 더 크다. `relation`은 독립적인 `manual` 교정이 없다 — 틀린 관계는 대부분 relation 변경셋이 `closed`+`outcome: discarded`로 잡히고(`open` 단계에서 판정), 그 외엔 끝점 Statement archived의 캐스케이드로만 archived된다. `reference`는 `create`·`modify`·`archive` 다 쓴다 — `modify`가 본질(계속 다듬어지는 게 존재 이유)이고, `archive`는 정리용(더 이상 안 쓰는 엔트리를 접음, 과거 인용은 그대로 유효). Reference의 과거 상태는 그 Reference를 대상으로 한 Change들을 시간순으로 훑어 재구성한다(별도 버전 필드 불필요). Reference의 과거 Change에 남는 민감정보(사람이 직접 입력한 경우)는 별도 리댁션 메커니즘을 두지 않는다 — git이 과거 커밋에 남은 평문 비밀값을 이력에서 지워주지 않는 것과 같은 이유로, 발생 확률 대비 복잡성이 안 맞는다.

Topic·Tag는 `targetType`에 없다 — 판단·사실 콘텐츠가 아니라 찾기용 라벨이라 잘못 바뀌어도 판단을 오염시키지 않으므로, Changeset 리뷰·불변성 없이 가볍게 직접 CRUD한다(soft delete만 유지).

같은 이유로 `Digest`의 `topicIds`·`tagIds`·`relatedDigestIds`·`externalUrls` 필드도 changeset 없이 Digest 상세에서 직접 추가·삭제한다 — Digest 본체(제목·본문·타입)는 확정 후 `create`/`archive`만 가능해도, 이 필드들은 Statement가 근거로 삼는 판단 내용이 아니라 찾기·참고용 메타라 예외로 둔다. `relatedDigestIds`는 특히 이 화면(Digest 상세)에서 사람이 직접 심는 게 아니라, 확정된 Digest의 2단계(Statement·Relation 생성)가 끝나면 그 결과로 드러난 연결을 엔진이 자동으로 채워 넣는다 — Thread(Topic 파생)와 달리 필드로 저장은 되지만, 사람이 판정하는 게 아니라 저장된 뒤에도 자유롭게 더하거나 뺄 수 있는 가벼운 참고 링크라 자동 채움이 원칙에 어긋나지 않는다.

`referenceIds`는 이 예외에 없다 — 본문 안 `@` 멘션이 유일한 인용 경로라(본문에 없는 걸 레퍼런스로 걸 수 없음, "지어내지 않는다"의 연장), 본문 문자열 자체가 바뀌는 것과 같은 조작이라서 본문 편집(archive+create)에 딸려서만 바뀐다. 별도의 레퍼런스 CRUD 화면·섹션은 없다 — 본문 멘션 클릭이 곧 그 Reference로 이동하는 유일한 진입점이다.

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
- **원본 빼기 → 파생 효과 되돌림(Reference 제외)** — 원본을 `pending`으로 되돌리는 건 그 원본이 만든 ingestion Changeset을 되돌리는 것과 같다. 그 Changeset이 만든 Digest·진술·관계는 함께 되돌아간다(archived, 끝점 archived의 관계 연쇄 포함). **Reference는 예외다** — Workspace 전체가 재사용하는 공유 자원이라, 이 changeset이 "만들었다"는 이유만으로 archive하면 다른 Digest가 그 뒤로도 계속 인용 중인 Reference를 감출 위험이 있어 create→archive 방향은 건너뛴다(완전 삭제 purge가 Reference를 cascade 대상에서 뺀 것과 같은 판단, #366). 반대로 그 changeset이 Reference를 archive했던 경우(예: 사람이 직접 정리)는 archive→restore로 되살아난다 — 공유 여부와 무관하게 안전한 방향이라서다. 재개하면 그 옛 산출물을 되살리는 게 아니라 처음부터 새로 인제스천한다. 단순 soft-archive가 아니라 파생 효과를 되돌리는 동작이다.
- **끝점 archived → 관계 연쇄** — 끝점 진술이 `archived`되면 걸린 관계도 함께 `archived`된다(연쇄 soft-archive). 끝점을 되살리면 관계도 돌아온다.
- **Digest 수정 시 relatedDigestIds 치환** — Digest가 수정(archive+create)되면, 그 옛 Digest를 `relatedDigestIds`에 담고 있던 다른 모든 Digest는 그 항목이 새 Digest ID로 자동 치환된다(재검증 없이 단순 치환 — `relatedDigestIds` 자체가 changeset 없이 가볍게 CRUD하는 참고용 메타라 이 정도 처리로 충분하다고 봄). 새 Digest도 옛 Digest의 `relatedDigestIds`를 그대로 물려받는다. `archived` 상태인 Digest는 피드·검색·관련 Digest 자동 추천 등 모든 목록에서 제외된다(하드 삭제는 아니라 원칙상 되살릴 순 있지만, 지금 MVP엔 그럴 화면이 없음 — 아래 "열어두는 것"의 `archived` 복구 화면 참고) — 이 치환 규칙 덕에 애초에 archived Digest를 `relatedDigestIds`가 가리키는 상태 자체가 안 생긴다.
- **변경셋 적용 (트리거별)** — `ingestion`은 항상 `open`으로 시작한다. Digest·Reference 후보를 사람이 확인해야(1단계, Digest 리뷰 화면) `closed`(`outcome: applied`)로 전환되고, 그 순간 Statement·Relation 생성(2단계)이 시작된다 — 애매해서가 아니라 모든 ingestion이 거치는 필수 게이트. `manual`·`revert`는 이미 사람이 확정한 단일 동작이라 곧바로 `closed`(`outcome: applied`). 2단계에서 관계 엔진이 새 Statement를 기존 것들과 대조한 결과는 `relation` 변경셋으로 나온다: 확신·비충돌 관계는 배치당 1개의 `relation` 변경셋이 곧바로 `closed`(`outcome: applied`)로 조용히 적용되고, 애매하거나 모순(`conflicts`)·같은 뜻의 중복(`duplicates`)인 쌍은 **쌍 하나마다** 별도의 `relation` 변경셋이 `open`으로 발생한다(쌍 N개면 changeset도 N개 — 사람이 하나씩 판정하므로 한 changeset으로 묶으면 부분 판정을 표현 못 함). open 제안은 활성 그래프 밖에서 대기하다 사람이 적용(`closed`+`outcome: applied`)하거나 버린다(`closed`+`outcome: discarded`) — 모순·중복은 엔진이 잘못 판단하면 되돌리기 전엔 드러나지 않는 채로 진술이 사라지거나 잘못 엮이므로 확신도와 무관하게 항상 사람 확인을 거친다.
- **레퍼런스·주제·태그는 병합을 고려하지 않음** — 중복 병합(`duplicates`)은 Statement 전용이다. Reference·Topic·Tag는 Source→Digest/Reference 변환 시 이미 레지스트리에 등록된 것과 매칭해 인용을 제안하므로, 애초에 같은 대상이 중복 생성되는 경우가 최소화된다. 매칭이 안 되면(협업 확장 시 Space 권한이 갈리는 경우 등) 병합 대신 중복을 그대로 허용한다.
- **open은 확정 전 초안** — `open` 상태인 changeset의 `changes`는 확정 전까지 사람이 자유롭게 고쳐 쓸 수 있는 초안이다(Digest 리뷰 화면의 본문·주제·태그 수동 편집, relation 제안 판정 시 제안된 관계를 다른 내용으로 바꾸는 것 모두 여기 해당). `closed`로 전환되는 순간(`outcome`이 뭐든) 그 시점 내용으로 고정된다.
- **되돌리기 (append-only)** — `closed`(`outcome: applied`)를 되돌릴 땐 status를 바꾸지 않고, 원본을 가리키는 revert 변경셋을 *추가*한다. "되돌려졌나"는 그 존재로 파생(폐기를 `replaces`에서 파생시킨 것과 같은 방식). 되돌림의 되돌림(redo)도 revert를 또 추가하면 된다.
- **버려짐 되살리기 (in-place)** — `applied`를 되돌리는 것과 달리, `closed`(`outcome: discarded`)를 되살릴 땐 새 changeset을 만들지 않고 **같은 changeset의 status를 그냥 `open`으로 되돌린다**(GitHub이 merge된 PR은 revert로 새 PR을 만들지만, merge 없이 닫힌 PR은 그냥 같은 PR을 reopen하는 것과 같은 구분 — 닫힌 목록에서 조용히 빠지는 것도 동일). `discarded`는 실제로 아무 일도 일어나지 않은 상태라 append-only로 보존할 "일어났던 사실"이 없고, 판단 콘텐츠를 가리는 것도 아니라 "충실함" 원칙과도 부딪히지 않는다. 되살리기가 가능한 조건은 그 changeset의 `sourceId`가 가리키는 Source가 지금 `pending`이고, 그 Source에 현재 `open`인 ingestion changeset이 없을 때뿐이다(이미 다른 시도로 `active`가 됐거나 이미 열려있는 리뷰가 있으면 막음 — 같은 Source에 리뷰가 동시에 여러 개 생기는 걸 방지).
- **`authorId` 규칙** — 사람이 *직접 만든 것*에만 붙는다: 원본(제공)·Digest(제공, `Source.authorId`를 승계). Changeset의 `authorId`는 사람이 그 changeset의 *내용 자체*를 만든 경우에만 붙는다 — `manual`·`revert`(편집·되돌리기 버튼을 사람이 직접 눌러 그 순간 확정하는 단일 동작이라 내용도 사람이 정함). `ingestion`은 얼핏 사람이 트리거한 것 같지만(Source 제출), changeset의 구체적 내용(Digest 몇 개로 나뉘는지·제목·Reference 후보 등)은 엔진이 만든 것이라 `relation`과 같은 엔진 산물로 취급 — `authorId` 없음(리뷰 화면엔 "엔진 제안"으로 표시, surface-inventory.md 참고). 진술·관계 자체(Statement·Relation)에도 없고, 소유·출처는 `digestId` → `Digest.authorId`로 파생. (있음→사람, 없음→엔진)
- **참·거짓 미판단** — 시스템은 진술의 진위를 가리지 않는다. 진술의 유효함은 *존재 + 대체(`replaces`·`duplicates`) 관계 없음*으로 정해지고, 모순은 `conflicts`로 드러내되 어느 쪽이 옳은지는 사람이 정한다. "언제부터 참인가" 같은 시간 표현은 진술 내용에 담겨 읽기 시점에 풀린다 — 시스템이 "지금 유효한가"를 기계적으로 계산하는 동작이 없으므로 별도 시각 필드를 두지 않는다.
- **Topic은 Digest 확정 시 붙는 재사용 라벨** — 사람이 Digest 리뷰 화면에서 확정할 때 붙이며(`Digest.topicIds?`), Space별 레지스트리로 영속해 재사용된다. 같은 Topic이 붙은 Digest들이 다시 켰을 때 하나의 Thread로 모인다.
- **완전 삭제(trashed → 배치 purge)** — `trashed`는 사용자가 명시적으로 삭제를 선택했다는 신호이고(soft archive와 달리 무기한 보존이 아님), `trashedAt` 이후 보관 기간(30일)이 지나면 매일 도는 배치(pg_cron)가 완전 삭제를 실행한다(#363). **원본을 DELETE 한 번 하면 나머지는 FK cascade로 자연 삭제된다** — 원본→Digest→진술 연쇄의 `statements.digest_id` 제약을 CASCADE로 바꿔서, 파생물(Digest·진술·관계·그 원본의 changeset)이 원본 소속 cascade로 한 번에 정리된다(changeset을 `sourceId` 기준으로 훑어 `create`/`modify`를 손으로 되돌리던 원래 설계는 `sourceId` 없는 `manual`·`revert` changeset을 놓치는 구멍이 있어 폐기). **Reference는 cascade 대상이 아니다** — Workspace 공유 자원이라 다른 원본이 인용 중일 수 있어, 한 원본 삭제로 지우면 안 된다(create/modify 구분 없이 그냥 안 건드림). 진술 hard delete로 고아가 되는 Qdrant 임베딩은 같은 트랜잭션에서 `vector_purge` 큐로 넘겨 워커가 정리한다.

  **되돌리기(revert, 확정 원본을 pending으로 되돌리는 일반 플로우)는 이 purge와 별개다** — purge는 `trashed` 30일 뒤 하드 삭제, revert는 위 "되돌리기(append-only)" 원칙대로 soft archive다.

## 열어두는 것

- Reference 변경 이력을 사용자가 보는 표면 — Reference 전용 페이지("원본 보기"처럼)에서 이전 버전을 보는 쪽으로 기움. 변경 이력을 별도 리스트로 둘지는 표면 설계 단계에서.
- 원본 실제 시점(발생·작성) — `createdAt`(시스템에 들어온 때)과 별개인 실제 발생/작성 시각. 소급 입력 등에서 문제되면 추가.
- 공유·그룹·세부 권한 *규칙* — 협업 단계에서. 소유·멤버십의 자리(Space=콘텐츠 그릇, Member=사람 묶음)는 오늘 확정했으니 재설계 없이 멤버 추가만으로 확장 가능. Group·세밀한 공유 축은 `10-concept-collaboration.md`에 개념만 있고 아직 스키마 반영 전.
- Space·Workspace 완전 삭제의 확인 UX — 파급 범위가 제일 크므로 Source보다 무거운 확인 절차가 필요(영향받는 Source·Digest 개수 표시, 이름 타이핑 확인 등). 삭제 메커니즘 자체는 Source의 완전 삭제를 부채꼴로 재사용하면 되지만, 그 앞의 확인 화면은 표면 설계 단계에서.
- 관계의 관계(reify) — 관계가 다른 관계의 끝점이 되어야 하면 그때 노드로 승격
- 원본 에셋(음성·이미지·파일)·`Locator` 형식 — body 외 원재료 묶음, 추후. 다만 연속된 범위 하나가 아니라 **다중 범위**를 가리킬 수 있어야 하는 건 확정(한 Digest가 원문 여기저기 흩어진 내용을 종합하는 경우 대비, Digest 리뷰 화면의 원문 대조 하이라이트도 이를 가정하고 설계됨) — 구체적 형식만 추후
- 전사·OCR 주체 — 누가 텍스트로 변환하나 (입력 경계)
- Topic·Tag·Reference의 `archived` 복구 화면 — 원칙상 되살릴 수 있어야 하는데, Topic·Tag는 전용 목록 화면 자체가 표면인벤토리에 없어 복구할 자리가 없다(Topic·Tag는 Digest 상세에서 칩으로 직접 추가·삭제만 가능). Reference는 "Reference 목록"이 있어 필터만 추가하면 되지만 명시된 건 아니다.
- 노이즈 필터 — 종류에 묶을지/별도 기준을 둘지 포함해, 기능 구현 단계에서

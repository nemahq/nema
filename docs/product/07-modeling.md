# 모델링

## 진술(Statement)

하나의 '왜'를 담은 문장 크기의 의미 한 조각. 맥락의 단위.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `content` | `string` | 진술 내용, 그 '왜' 자체 |
| `confidence?` | `enum: certain / guess` | 사실인가 추측인가 — `claim`에서만 (확장 가능) |
| `type` | `enum: claim / question / todo` | 진술의 종류 — 결정·미정 단언도 `claim` |
| `sourceRefs` | `SourceRef[]` | 원본 참조 |
| `createdAt` | `Date` | 진술이 시스템에 들어온 때 |
| `status` | `enum: active / archived` | 존재 상태 — 제거(빼기)는 `archived` |

## 원본(Source)

진술이 추출되어 나온 원재료. 의미로 다뤄지지 않고 무손실로 박제되며, 진술이 `sourceRefs`로 가리킨다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `body` | `string` | 진술을 뽑는 텍스트 층 (타이핑·붙여넣기·전사·추출 텍스트) |
| `createdAt` | `Date` | 원본이 시스템에 들어온 때 |
| `status` | `enum: active / archived` | 존재 상태 — 제거(빼기)는 `archived` |
| `authorId` | `uuid` | 누가 넣었나 (사용자 id) |

### SourceRef — 진술이 원본을 가리키는 포인터

`Statement.sourceRefs`의 원소.

| key | 타입 | 설명 |
|---|---|---|
| `sourceId` | `uuid` | 가리키는 원본 |
| `locator?` | `Locator` | 원본 내 위치 (선택 — `body`의 문자 범위 등) |

## 관계(Relation)

두 진술을 잇는 방향 있는 선. 진술과 동급의 단위이며, "무엇이 무엇을 지지·반박·대체하는지"의 그래프가 네마가 지키는 자산이다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `type` | `enum: supports / conflicts / replaces / resolves` | 관계 종류 (인과·시간순·연관은 동작 갈리면 추가) |
| `fromId` | `uuid` | 출발 진술 (A) |
| `toId` | `uuid` | 도착 진술 (B) |
| `createdAt` | `Date` | 관계가 생긴 때 |
| `status` | `enum: active / archived` | 존재 상태 — 제거(빼기)는 `archived` |

**방향 의미**
- `supports` A→B: A가 B를 뒷받침한다 ("B인 이유는 A").
- `conflicts`: A와 B가 부딪힌다. 논리상 대칭이나 저장은 방향 있게 두고 동작에서 대칭으로 다룬다.
- `replaces` A→B: A가 B를 밀어내 B가 지난 것이 된다. 진술의 폐기는 여기서 파생된다.
- `resolves` A→B: A(답·완료)가 B(질문·할일)를 닫는다. 폐기와 달리 B는 틀린 게 아니라 해소된 것.

## 변경셋(Changeset)

한 번의 변경(원본 인제스천·충돌 해결·합치기·수동 편집·되돌리기)을 묶는 단위. 진술·관계의 생성·제거를 묶어 리뷰·되돌리기·이력으로 다룬다. 검토 흐름이 개별 진술·관계가 아니라 이 묶음에 붙는다 — GitHub의 커밋/PR과 같은 자리다.

| key | 타입 | 설명 |
|---|---|---|
| `id` | `uuid` | 식별자 |
| `type` | `enum: ingestion / conflict / merge / manual / revert` | 무엇이 일으킨 변경인가 |
| `status` | `enum: pending / applied` | 변경셋 생애 (되돌림은 revert 변경셋으로 파생) |
| `changes` | `Change[]` | 이 변경셋이 가하는 연산들 |
| `sourceId?` | `uuid` | 인제스천이면 어느 원본에서 |
| `revertsId?` | `uuid` | 되돌리는 대상 변경셋 (`revert`에서만) |
| `createdAt` | `Date` | 만들어진 때 |
| `authorId?` | `uuid` | 사람이 일으킨 변경의 주체 (엔진이면 없음) |

### Change — 변경셋이 가하는 개별 연산

`Changeset.changes`의 원소.

| key | 타입 | 설명 |
|---|---|---|
| `action` | `enum: create / archive / modify` | 연산 |
| `targetType` | `enum: statement / relation / source` | 대상 종류 |
| `targetId` | `uuid` | 대상 |
| `data?` | `object` | 바뀐 필드·값 (`create`·`modify`에서. `archive`엔 없음) |

`source`는 `create`/`archive`만 — 불변(박제)이라 `modify` 없음.

## 동작 규칙

- **원본 빼기 → 진술·관계 유지** — 원본을 `archived`로 빼도 진술·관계는 건드리지 않는다(soft-archive라 `sourceRefs`로 여전히 추적됨). 잘못 올린 원본의 진술까지 빼려면 사람이 직접 뺀다.
- **끝점 archived → 관계 연쇄** — 끝점 진술이 `archived`되면 걸린 관계도 함께 `archived`된다(연쇄 soft-archive). 끝점을 되살리면 관계도 돌아온다.
- **내용 수정 → 관계 재평가** — 진술을 `modify`하면 옛 내용 기반 관계가 stale해질 수 있어, 엔진이 영향받은 관계를 재검사해 어긋난 것을 검토(보류 변경셋)로 표면화한다(조용히 안 깨짐).
- **변경셋 적용 (혼합)** — 사람이 일으킨 변경(`ingestion`·`manual`·`revert`)과 엔진이 확신한 변경은 곧바로 `applied`(조용히 반영). 엔진이 애매·충돌로 판단한 것만 `pending`으로 활성 그래프 밖에서 대기하다 사람이 적용한다.
- **되돌리기 (append-only)** — `applied`를 되돌릴 땐 status를 바꾸지 않고, 원본을 가리키는 revert 변경셋을 *추가*한다. "되돌려졌나"는 그 존재로 파생(폐기를 `replaces`에서 파생시킨 것과 같은 방식). 되돌림의 되돌림(redo)도 revert를 또 추가하면 된다.
- **`authorId` 규칙** — 사람이 *직접 만든 것*에만 붙는다: 원본(제공)·사람 주도 변경셋(`ingestion`·`manual`·`revert`). 엔진 산물(진술·관계)엔 없고, 소유·출처는 원본에서 파생(`sourceRefs` → `Source.authorId`). (있음→사람, 없음→엔진)
- **참·거짓 미판단** — 시스템은 진술의 진위를 가리지 않는다. 진술의 유효함은 *존재 + 대체(`replaces`) 관계 없음*으로 정해지고, 모순은 `conflicts`로 드러내되 어느 쪽이 옳은지는 사람이 정한다. "언제부터 참인가" 같은 시간 표현은 진술 내용에 담겨 읽기 시점에 풀린다 — 시스템이 "지금 유효한가"를 기계적으로 계산하는 동작이 없으므로 별도 시각 필드를 두지 않는다.
- **핵심어는 단위가 아님** — 인물·조직·주제 등 핵심어는 별도 단위가 아니라 진술에서 파생되는 검색용 꼬리표/렌즈다. 단위·소유·변경셋에 들어가지 않고 언제든 재생성된다.

## 열어두는 것

- 원본 실제 시점(발생·작성) — `createdAt`(시스템에 들어온 때)과 별개인 실제 발생/작성 시각. 소급 입력 등에서 문제되면 추가.
- 권한·가시성 *규칙* — 협업 단계에서. 단 소유의 *자리*(중립 이름의 소속 층, 오늘은 소속=사용자 1인)는 지금 둔다 — 멀티플레이어 전환이 재설계가 아니라 멤버 추가가 되도록. 그 층을 무엇으로 볼지(콘텐츠 그릇 vs 사람 묶음)는 별도 논의.
- 관계의 관계(reify) — 관계가 다른 관계의 끝점이 되어야 하면 그때 노드로 승격
- 원본 에셋(음성·이미지·파일)·`Locator` 형식 — body 외 원재료 묶음, 추후
- 전사·OCR 주체 — 누가 텍스트로 변환하나 (입력 경계)
- 완전 삭제 — 기밀 등 soft delete(`archived`)로 안 풀리는 진짜 삭제 케이스, 따로
- 노이즈 필터 — 종류에 묶을지/별도 기준을 둘지 포함해, 기능 구현 단계에서
- `Change.data` 형식 — modify의 before/after 보존(되돌리기용) 포함, 구현 단계에서
- stale 관계 재평가의 변경셋 `type` — 별도 flat 값(가칭 `recheck`)로 추가, edit 재평가 흐름 만들 때 (`conflict` 흡수·`review` 래퍼 아님)

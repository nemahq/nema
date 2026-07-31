# Weave 사용 가이드

UI를 추가·수정할 때 `@nema-io/weave`(디자인 시스템)를 먼저 검토하기 위한 문서. "무조건 weave를 쓴다"가 목표가 아니다 — **먼저 검토하고, 안 쓰기로 했으면 이유를 남긴다**가 규칙이다. weave를 과하게 적용하는 것도 실패다(예: 자체 타이포·색을 가진 탭에 `Button`을 얹고 그 스타일을 다시 꺼내는 것).

## 원칙

- 새 UI를 만들기 전, `packages/weave/src/index.ts`에 대응 컴포넌트가 있는지 먼저 확인한다.
- 없으면 raw 태그를 써도 된다. 다만 **같은 성격의 raw 태그가 이미 여러 곳에 있다면** — 이번이 컴포넌트를 신설할 시점이다(예: weave `Input`은 있는데 `Textarea`가 없어 3곳이 각자 미묘하게 다른 스타일을 들고 있던 사례).
- 있는데 안 쓴다면, 왜 안 맞는지 코드 주석으로 남긴다. "일단 raw로" 하고 넘어가면 다음 사람이 같은 판단을 처음부터 다시 해야 한다.
- 레이아웃(마진·폭·정렬)은 소비처의 책임이다. 색·타이포·시맨틱(variant, 상태 표현)은 컴포넌트의 책임이다. 소비처가 `className`으로 마진을 주는 건 정상이고, 소비처가 매번 색을 오버라이드해야 한다면 컴포넌트 설계가 그 소비처를 놓친 것이다.
- 컴포넌트가 `size`/`weight`/`variant` 같은 prop을 노출하면 그걸 쓴다. `className="text-sm"`처럼 raw Tailwind 클래스로 우회하지 않는다 — tailwind-merge가 prop이 만든 클래스를 덮어써서, 컴포넌트가 관리하는 스케일 밖으로 조용히 빠져나간다.

## 컴포넌트별 판단

| 컴포넌트 | 쓴다 | 안 쓴다 |
|---|---|---|
| **Button** | 독립적으로 서 있는 액션(다이얼로그 액션, 폼 제출, 사이드패널 닫기 등). 원형 아이콘 버튼(hover-reveal 삭제·⋯ 메뉴 트리거 등)은 `shape="circle"` — `size`(치수)와 직교하는 축이라 함께 조합한다 | 주변에서 타이포·색을 상속해야 하는 자리(칩·pill 안 버튼), 자체 타이포·활성 표현이 있는 자리(탭, 내비게이션). base가 `text-[13px] font-semibold`를 강제하므로 되돌리는 비용이 얻는 것보다 클 때가 많다 |
| **Badge** | 상태·개수 같은 짧은 메타데이터(태그, 참조 라벨, 개수 배지). `shape="pill"`은 카운트·이름표처럼 통째로 하나의 값을 담는 자리, 기본값(각진)은 여러 개를 나란히 늘어놓는 태그·상태 자리. `variant="outline"`은 배경 없이 테두리(`border-strong`)로만 구분하는 표현 — 틴트 배경이 없는 만큼 테두리·글자(`fg-primary`) 둘 다 강하게 존재감을 유지한다(`Chip`과 공유하는 톤, `OUTLINE_TONE_CLASSNAME`). `color`(색조)는 weave가 뜻을 모르는 분류를 서로 구별해야 할 때만 — 의미가 있는 자리엔 `variant`를 쓴다. `size="sm"`은 제목·라벨 옆에 곁들이는 보조 표시용. 이름을 담아 줄여야 하는 pill은 `truncated`로 감당한다(`min-w-0`+`truncate`를 함께 묶어줌) | 클릭해서 값을 바꾸는 자리(→ `Chip`), 아이콘 포함 + 상태별 분기가 있는 것(상태 표시) |
| **Chip** | `Badge`의 인터랙티브 짝. `remove`(`onRemove`+`removeAriaLabel`, 항상 같이 받아야 해서 판별 유니언) 없이 값 하나를 보여주다 클릭하면 `DropdownMenu` 등으로 바꾸는 pill(Space 재지정 등), `remove`가 있으면 제거 가능한 라벨 칩(Reference 태그·Digest Topic) — 이때만 루트가 `<button>`에서 `<span>`으로 바뀐다(안에 실제 제거용 `<button>`이 들어가 중첩을 피해야 해서). `variant`(neutral/outline)는 `Badge`와 톤 공유, `color`(`TagColor` 8색)는 사용자가 만드는 개방형 태그 전용 — `Badge`의 variant/color 구분과 같은 이유로 배타적이다. 생성 시 랜덤/엔진이 초기값을 채우지만 최종 선택은 항상 사용자 몫이라 `TagColorGridPicker`/`TagColorListPicker`로 계속 바꿀 수 있다. `shape`(rounded/pill)로 나란히 늘어놓는 자리와 값 하나 담는 자리를 구분, 이름을 줄여야 하면 `truncated` | 값을 보여주기만 하는 자리(→ `Badge`), 독립적으로 서 있는 액션(→ `Button`) |
| **Textarea** | 멀티라인 텍스트 입력(`Input`은 `<input>`이라 `h-9` 고정, 여러 줄 불가). `variant`(default/borderless)로 테두리 유무, `autoSize`(boolean, `maxRows`로 상한)로 내용에 맞춰 자동 성장, `resize`(none/vertical)로 네이티브 드래그 리사이즈 — 자동 성장과 수동 리사이즈가 서로 충돌해 `autoSize`/`resize`는 배타적 유니언. `size`/`weight`/`color`는 `Text`와 공유 | 한 줄짜리 입력(→ `Input`) |
| **Avatar** | 사람·워크스페이스·Space 등 정체성을 나타내는 이니셜/이미지 | — (없음. `shape="circle"`은 사람, `shape="square"`는 공간을 가리킨다는 규칙을 따른다) |
| **HoverIcon** | 이미 자체적으로 hover 반응하는 표면(카드·행·LNB 아이템) 위에 겹쳐 뜨는 작은 액션 아이콘. `active` prop으로 hover를 안 하고 있어도 hover와 같은 톤을 강제 재현(트리거가 열려 있는 상태 등) | 독립적으로 서 있는 아이콘 버튼(→ `Button` `shape="circle"`), 조상 hover에 안 얹히는 자리 |
| **Tab** | 고정 개수의 뷰를 전환하는 밑줄 탭(segmented control에 가까운 자리, 예: Space 개요의 topic/changesets). `role="tab"`은 일부러 안 줌 — 소비처가 `role="tablist"` 부모까지 갖춘 완전한 탭 패턴을 구현할 때 직접 얹는다 | 열고 닫고 드래그로 재정렬하는 문서 탭(TabbedPanel처럼 DOM 구조 자체가 다른 자리) — 이땐 `TAB_ACTIVE_INDICATOR_CLASSNAME` 색 토큰만 가져다 쓴다 |
| **ComboboxItem** | 검색 팝오버 등에서 전체 폭이 hover 반응하는 목록 행(태그/토픽 검색 결과, "새로 만들기" 행, 색상 피커 리스트). `disabled`(완전 비활성)·`active`(시각 강조만, 클릭은 안 막음 — 색 피커의 "현재 값이지만 재선택 가능"용)·`readOnly`(클릭은 막되 hover·형제 액션은 유지 — 이미 붙은 항목처럼 다시 고를 순 없지만 설명·액션은 계속 봐야 하는 행용) 셋을 구분 | 패딩·타이포·색까지 관리해주길 기대하는 자리(컴포넌트는 구조만 담당, 나머지는 `className`/`Text`에 위임) |
| **TagColorGridPicker / TagColorListPicker** | `Chip`의 `TagColor` 8색을 사용자가 직접 고르는 자리. 생성 폼처럼 한눈에 훑는 가로 배치는 `TagColorGridPicker`(스와치 + 호버 Tooltip), 편집 팝오버처럼 세로로 늘어놓고 이름을 바로 보여줘야 하면 `TagColorListPicker`(`ComboboxItem` `active` 활용). 색 이름 문구는 weave가 tolgee를 몰라 `getColorLabel` 콜백으로 소비처가 번역해 넘긴다 | 색이 아닌 임의 팔레트가 필요한 자리(8색 고정 팔레트 전용) |
| **Separator** | 화면 요소 사이를 시각적으로 나누는 독립된 선 | 요소 자신의 테두리로 표현되는 경계(`border-b`로 이미 충분한 카드·행). 별도 형제 요소로 만들 이유가 없다 |
| **Label** | 폼 컨트롤에 붙는 라벨을 `FormLabel` 없이 단독으로 쓸 때(예: 체크박스 행처럼 라벨이 곧 클릭 영역인 자리). `size`/`weight`/`color`는 `Text`와 스케일 공유(기본값 sm/medium/primary) | 라벨-입력-에러가 한 세트인 자리(→ `Form`) |
| **Form**(`FormField`/`FormLabel`/`FormControl`/`FormMessage`) | 라벨-입력-에러가 짝을 이루는 자리. `FormField`가 `id`를 만들어 context로 내려주고, `FormLabel`(`htmlFor`)·`FormControl`(Radix `Slot`으로 자식에 `id`+`aria-describedby` 주입 — 자식이 `Input`이든 `Textarea`든 컨트롤 종류를 몰라도 동작)·`FormMessage`(`reserveSpace`로 에러 유무와 무관하게 높이 고정, `variant="error"`일 때 스크린리더용 "오류:" 접두어 자동 추가)가 자동으로 연결된다 | 라디오형 피커처럼 단일 포커스 컨트롤이 아니라 그룹인 필드(`FormControl` 없이 `FormField` 안에서 `role="group"`으로 직접 조립), 시각 라벨 없이 `aria-label`만으로 충분한 자리(정적 값이 이미 라벨을 대신하는 등) |
| **Text** | 타이포그래피가 필요한 모든 텍스트 | — (별도 작업 중, `PR #460` 참고) |

## 구분선 3단 위계

선의 무게는 길이 × 대비 × 반복 횟수다. 한 톤으로는 화면을 가르는 영역 경계와 목록에서 수십 번 반복되는 구분선을 같이 감당할 수 없다.

| 토큰 | 용도 |
|---|---|
| `border-strong` | 짧고 닫힌 윤곽(포커스 테두리, Kbd) — 길이가 짧아 대비로 존재감을 만들어야 한다 |
| `border` | 화면을 가르는 영역 경계(탭 바, 헤더, 사이드바) — 길이가 이미 존재감을 만들어주므로 최대 대비가 필요 없다 |
| `border-subtle` | 반복되는 목록 구분선 — 리듬만 주고 물러난다 |

같은 논리가 `fg-*` 램프에도 적용된다: `fg-quaternary`(placeholder, 80%)와 `fg-quinary`(비활성, 60%)를 나눈 이유는 WCAG가 비활성 UI 요소는 대비 요건에서 면제하지만 placeholder는 활성 필드의 안내문이라 읽혀야 하기 때문이다. 성격이 다른 상태를 한 토큰으로 겸하면 둘 중 하나는 반드시 틀린 값이 된다.

## 함정 — 오버라이드가 조용히 실패하는 경우

컴포넌트 base 클래스에 `dark:`, `data-[...]:`, `peer-*:` 같은 접두사(variant)가 붙어 있으면, 소비처가 `className`으로 넘긴 평범한 클래스가 **특이도에서 져서 조용히 무시된다.** 에러도 경고도 없고, 특정 조건(다크 모드, 특정 상태)에서만 틀어져 발견이 늦다.

```
cn("dark:bg-brand", "bg-red-500")  →  "dark:bg-brand bg-red-500"
```

둘 다 클래스 문자열엔 남지만, `.dark .dark\:bg-brand`(특이도 0,2,0)가 `.bg-red-500`(0,1,0)을 항상 이긴다.

**판단 기준**: 소비처가 바꿀 일이 없는 내부 상태 표현(focus, checked 등)에는 접두사 클래스를 둬도 된다. 소비처가 바꾸고 싶어할 속성(배경·글자색·모양·크기)에는 두지 않는다 — JS 분기(`orientation === "horizontal" ? ... : ...`)나 토큰으로 옮긴다.

**증상**: 오버라이드를 했는데 특정 모드/상태에서만 안 먹으면 이 함정을 의심할 것.

## Button 안의 아이콘은 직계 자식으로 둔다

Button의 base 클래스가 자식 `svg`를 자동으로 처리한다 — 크기(`[&_svg:not([class*='size-'])]:size-4`), 패딩 보정(`has-[>svg]:px-*`), 라벨과의 간격(`gap-*`). 이 중 패딩 보정은 **direct child(`>`) 셀렉터**라, 라벨에 색·크기를 주려고 아이콘까지 같이 다른 엘리먼트(`Text` 등)로 감싸면 그 보정만 조용히 빠진다 — 크기·간격은 descendant 셀렉터라 여전히 맞기 때문에 눈에 잘 안 띈다.

**증상**: 아이콘 있는 버튼인데 좌우 여백이 아주 살짝 넓어 보이면 이 함정을 의심할 것. (`ErrorFallback` 복사 버튼에서 실제로 발생했던 사례 — PR #503)

## DropdownMenu/Popover/Select 트리거는 열려 있는 동안 눌린 것처럼 보여야 한다

`Button`/`SelectTrigger`/`Chip`은 `data-[state=open]`을 hover와 같은 톤으로 이미 처리한다 — `DropdownMenuTrigger`/`PopoverTrigger`에 `asChild`로 얹거나 `Select`를 그대로 쓰면 별도 작업 없이 열려 있는 동안 자동으로 눌림 표시가 된다. 트리거가 이 셋이 아닌 raw 태그(`<button>` 등)라면 소비처가 `data-[state=open]:` 클래스를 직접 달아야 한다(`DigestTopicPicker` 참고).

**함정 — Tooltip과 DropdownMenu(또는 Popover)를 같은 트리거에 이중으로 `asChild`로 겹치면 안 먹는다.** Radix가 두 프리미티브의 `data-state`를 같은 DOM 노드에 병합하는데, 바깥쪽(Tooltip)이 안쪽(DropdownMenu) 것을 덮어써서 메뉴가 열려 있어도 `data-state`가 "closed"로 찍힌다. 이 조합에선 `data-[state=open]:` 셀렉터 대신 `DropdownMenu`의 `open`/`onOpenChange`를 직접 들고 그 값으로 className을 분기한다 — `SpaceItemMenu`, `DigestCardMenu` 참고.

## 새 토큰을 추가할 때

토큰은 정의만으로 끝나지 않는다. 아래 세 층을 다 거쳐야 실제로 쓸 수 있는 클래스가 생긴다 — 이번 작업에서 한 층이 빠져 죽은 코드가 두 번 나왔다(`border-strong`이 7곳에서 쓰였지만 어디에도 정의되지 않았던 것, `Select`의 placeholder 스타일이 `::placeholder` 의사요소를 겨냥했지만 Radix Select는 `data-placeholder` 속성이라 선택자가 애초에 안 맞았던 것).

1. **팔레트** — `packages/weave/src/tokens/index.css`의 `:root` 팔레트 블록에 원시값 정의
2. **시맨틱** — 테마 4블록(`:root`, `.dark`, `.theme-inverted`, `.dark .theme-inverted`) 전부에 매핑. 빠뜨리면 특정 테마에서만 조용히 깨진다
3. **Tailwind 노출** — `@theme inline` 블록에 `--color-*` 매핑까지 있어야 실제 유틸리티 클래스(`bg-*`, `text-*`)가 생성된다

추가한 뒤 실제로 쓰는 파일에서 브라우저 devtools로 computed style을 확인하거나, 최소한 값이 기대한 대로 나오는지 실제 렌더 결과를 본다 — 클래스 이름이 정상으로 보여도 선택자가 안 맞으면 아무 효과가 없다.

## 컴포넌트 설계자용 — sizing 스케일을 정의할 때

(소비처 규칙은 위 "원칙" 참고 — `size` prop을 쓰고 raw 클래스로 우회하지 않는다. 아래는 그 `size` prop 자체를 새로 만들거나 스케일을 바꿀 때의 주의사항이다.)

`Text`의 사이즈 티어(`xs`/`sm`/`base`)처럼, 컴포넌트 prop 값 이름이 Tailwind 유틸리티 이름(`text-xs`, `text-sm`, `text-base`)과 같으면 **실제 픽셀 값도 반드시 일치**해야 한다. 이름이 같은데 값이 다르면("컴포넌트의 `sm`은 13px, Tailwind의 `text-sm`은 14px") 아는 사람일수록 더 잘 속는 함정이 된다. 스케일을 새로 설계할 땐 Tailwind 기본값을 기준점으로 삼을 것.

## 스켈레톤은 실제 컴포넌트의 스케일을 참조한다

로딩 스켈레톤의 크기를 손으로 계산해 넣으면(`h-[11px] w-1/4` 같은 매직 넘버), 실컴포넌트의 스케일이 바뀔 때 스켈레톤만 안 따라가 레이아웃이 흔들린다. `TextSkeleton`이 `Text`와 같은 사이즈 스케일을 코드로 직접 참조하는 것처럼, 스켈레톤은 실제 컴포넌트가 노출하는 값을 재사용해서 드리프트가 구조적으로 불가능하게 만든다.

## 강제 장치

- **eslint** `nema/require-state-fg-token` — placeholder/disabled 색 토큰 오용을 잡는다
- **eslint** `nema/no-raw-color-value` — `bg-[#...]`처럼 토큰을 우회하는 임의 색상값을 잡는다
- 둘 다 값·존재 여부처럼 **판단 없이 열거 가능한 것만** 잡는다. "이 자리에 Button을 써야 하나"처럼 맥락 판단이 필요한 건 린트로 못 잡는다 — 이 문서와 PR 리뷰가 대신한다

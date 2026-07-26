# 디자인 QA 체크리스트

전문 디자이너 없이 매 폴리싱 라운드가 같은 기준으로 돌아가게 하기 위한 문서. "예쁜가?"를 묻지 않는다 — 고정된 카테고리를 같은 순서로 훑고, 가능한 모든 판단을 **측정**(대비 수치, computed style, 키보드 포커스)으로 내린다. 눈으로 봐서 의심스러운 것도 재기 전엔 finding으로 세지 않는다.

이 문서는 2026-07-10 신규 유저 랜딩 슬라이스의 실제 폴리싱 라운드에서 걸린/걸리지 않은 항목을 그대로 반영해 처음 작성됐다(`design-decisions-log.md` 해당 세션 기록 참고). `check-conventions.md`/`check-terminology.md`/`check-ux-writing.md`와 같은 자리— 다만 이건 **라이브 브라우저가 필요해 diff만으론 못 도는 체크**라 `/create-pr`의 자동 병렬 게이트가 아니라 `/check-visual-consistency`로 별도 호출한다.

---

## 판단 기준(앵커) — 내 취향이 기준이 되지 않게

| 기준 | 소스 |
|---|---|
| 레이아웃·컴포넌트 구성 | `docs/poc/mvp-wireframe.html` (SSOT) |
| 색상·모션 | weave 토큰(`--fg-*`/`--surface-*`/`duration-*`) |
| 스페이싱·타이포 | Tailwind 기본 스케일(스페이싱 전용 토큰 안 만들기로 기결정) |
| 대비 | WCAG AA — 일반 텍스트 4.5:1, 큰 텍스트(18pt+, 또는 14pt+bold) 3:1 |
| 접근성 룰 | `apps/web/docs/conventions.md` Accessibility 섹션 + 루트 CLAUDE.md |

새 화면에서 "이 값이 이상해 보인다"는 느낌이 들면, 먼저 이 표 중 어디에 근거해 판단할지부터 정한다. 근거를 못 대면 finding이 아니라 개인 취향이다.

## 고정 카테고리(매번 같은 순서)

### 1. 색상·대비

- 텍스트/배경 대비를 **실측**한다. `getComputedStyle`이 `oklab()`/`oklch()`로 색을 반환하면 canvas로 sRGB 변환 후 WCAG 상대휘도 공식으로 계산(스크린샷 눈대중 금지 — 라이트 모드에서 근소한 차이도 AA 통과/실패를 가른다).

```js
function toRGB(css) { const c=document.createElement('canvas'); c.width=c.height=1; const ctx=c.getContext('2d'); ctx.fillStyle=css; ctx.fillRect(0,0,1,1); const [r,g,b,a]=ctx.getImageData(0,0,1,1).data; return {r,g,b,a:a/255}; }
function luminance({r,g,b}) { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); }
function contrast(c1,c2){ const l1=luminance(c1),l2=luminance(c2); const [hi,lo]=l1>l2?[l1,l2]:[l2,l1]; return (hi+0.05)/(lo+0.05); }
```

- **flag 전에**: 그 색/opacity 조합이 이 기능에서 처음 쓰이는 값인지, 앱 전역 관례인지 `grep -rn "text-fg-tertiary/" apps/web/src`처럼 확인한다. 전역에서 100% 압도적으로 쓰인다면 그 값 자체가 이미 AA에 맞춰 튜닝된 것일 수 있다(실제 사례: `fg-tertiary` 100% = 4.59:1로 AA를 정확히 겨냥해 설계돼 있었음).
- **예외**: `aria-disabled`/비활성 컨트롤은 WCAG가 대비 요구를 면제한다. 다만 "면제 대상이니 아무렇게나"가 아니라, weave의 기존 disabled 관례(`disabled:opacity-50`)와 대비값을 비교해 크게 벗어나지 않는지 확인한다.
- 라이트/다크 **둘 다** 재측정한다 — 같은 opacity 값이 테마마다 결과가 다르다(다크는 헤드룸이 넓어 통과, 라이트는 아슬아슬한 경우가 흔함).

### 2. 타이포그래피

- `getComputedStyle`로 `fontSize`/`fontWeight`/`lineHeight` 실측. 스크린샷을 확대해 "커 보인다"는 인상은 굵기 차이의 착시인 경우가 많다 — 실측 없이 판단하지 않는다.

### 3. 간격·정렬

- Tailwind 기본 스케일 준수(임의 px 값 금지). 아이콘·텍스트 baseline 정렬, 섹션 간 여백 일관성.

### 4. 상태(States)

- hover / focus-visible / active / disabled / loading / empty / error 커버 여부.
- **포커스는 스크린샷으로 안 보인다.** 실제 키보드로 Tab을 눌러 `document.activeElement`의 `outlineStyle`/`boxShadow`를 읽는다:

```js
const el = document.activeElement;
const cs = getComputedStyle(el);
({ tag: el.tagName, cls: el.className, outline: cs.outlineStyle, boxShadow: cs.boxShadow })
```

- 포커스링은 weave 전역 정책(`packages/weave/src/tokens/index.css`의 `*:focus-visible { outline ... }`)이 모든 포커스 가능 요소에 이미 적용돼 있다 — 컴포넌트가 자체 `focus-visible:ring-*`를 새로 다는 건 정상이 아니라 예외(색만 바꾸는 등 특수 케이스, 예: `Button` danger variant의 `focus-visible:outline-status-error`)다. 인터랙티브 요소가 `outline-none`/`outline-hidden`을 걸었다면 전역 링을 실수로 죽인 건 아닌지부터 확인 — 루트 CLAUDE.md "MUST NOT remove focus styles" 직접 위반 사례가 실제로 나온 적 있다.
- **링은 `focus-visible:`로만 준다.** Plain `focus:`로 링/아웃라인을 넣으면 마우스 클릭에도 뜬다. `focus:` 자체가 전부 금지는 아니다(Radix 메뉴 아이템의 `focus:bg-*`/`data-[highlighted]:*`는 방향키 탐색용 하이라이트라 다른 목적 — 이건 마우스 호버든 키보드든 항상 떠야 정상, `apps/web/docs/conventions.md` Accessibility 절 참고).
- 반대로 `aria-disabled`인 비활성 항목은 `tabIndex`가 없어 포커스 대상 자체가 아니어야 한다(있으면 별도 focus 스타일이 필요해짐).

### 5. 일관성(기존 패턴 재사용)

- 새 UI가 비슷해 보이는 기존 컴포넌트를 참고할 때, **용도가 같은지부터 확인**한다(겉보기만 비슷한 다른 목적의 컴포넌트를 잘못 참고하면 오히려 새 불일치를 만든다).
- 이 프로젝트의 화면 구성 SSOT는 `docs/poc/mvp-wireframe.html`이지 임의의 기존 컴포넌트가 아니다.

### 6. 카피

- `check-ux-writing.md`가 이미 커버 — 여기서 중복 체크하지 않는다.

## 측정 없이 flag하면 안 되는 것들(실제로 걸러진 오탐)

아래는 스크린샷만 보고 판단했다면 잘못 "수정"했을 것들 — 매 라운드 같은 착시가 반복될 수 있어 기록해둔다.

- **화면 폭이 다른 크기로 보임** → 실측하면 폰트 크기 동일, 폰트 굵기(weight) 차이였음.
- **이니셜/아바타 텍스트가 예상과 다름** → fallback 로직 버그가 아니라 외부(Google 등) 프로필 이미지 자체 콘텐츠였을 수 있다. `<img>`가 실제로 로드됐는지(`naturalWidth`) 먼저 확인.
- **구두점/구분자가 다른 글자처럼 보임** → 스크린샷 안티앨리어싱 착시. `charCodeAt`으로 실제 문자 확인.
- **탭/버튼 스타일이 "이상하다"** → 참고해야 할 기존 패턴이 맞는지 먼저 확인(용도가 다른 컴포넌트와 비교하고 있을 수 있음).

## 심각도 분류

| 등급 | 정의 | 처리 |
|---|---|---|
| **막힘** | 기능이 깨지거나 완전히 못 읽음 | 즉시 수정, 라운드 진행 전에 처리 |
| **이번 라운드 반영** | 객관적 근거(WCAG 수치, CLAUDE.md 룰 위반, 관례 이탈) 있고 스코프가 작음(관련 없는 파일 안 건드림) | 라운드 끝에 일괄 반영([[feedback_batch_fixes]]) |
| **백로그** | 근거는 있으나 스코프가 이 기능 밖(다른 기존 컴포넌트까지 손대야 함)이거나 판단에 이견 여지 있음 | 근거와 함께 기록, 별도 슬라이스로 |

## 프로세스

1. dev 서버 기동, 대상 화면 스크린샷(라이트+다크)
2. 고정 카테고리 순서로 훑기(1~6), 의심 항목은 전부 실측
3. 실측 결과를 위 3단계로 분류
4. "이번 라운드 반영" 항목만 일괄 수정
5. 수정마다 **재스크린샷이 아니라 재측정**으로 확인(대비 수치, computed style, 실제 키보드 Tab)
6. `pnpm typecheck && pnpm lint`로 정적 검증

import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_TITLE_MAX_LENGTH,
  DIGEST_TYPES,
} from "@nema-io/shared";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Text,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import {
  Check,
  Circle,
  Ellipsis,
  FileText,
  Shapes,
  Trash2,
} from "@nema-io/weave/icons";

import { useNotificationSoftAsk } from "@web/features/notifications";
import {
  confirmDisabledReason as computeConfirmDisabledReason,
  runConfirmReview,
} from "@web/features/review/confirmReviewFlow";
import {
  DIGEST_BODY_FIELDS,
  DIGEST_TYPE_BADGE_VARIANT,
  DIGEST_TYPE_LABEL_KEY,
} from "@web/features/review/constants";
import { useChangesetNumber } from "@web/features/review/hooks/useChangesetNumber";
import { useConfirmReview } from "@web/features/review/hooks/useConfirmReview";
import { useDigestReviewSuspenseQuery } from "@web/features/review/hooks/useDigestReviewQuery";
import { useDiscardReview } from "@web/features/review/hooks/useDiscardReview";
import { useUpdateReview } from "@web/features/review/hooks/useUpdateReview";
import { computeReviewEditingState } from "@web/features/review/reviewEditingState";
import { useCurrentSpaceId } from "@web/features/workspace";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { ChangesetDetailHeader } from "./ChangesetDetailHeader";
import { ChangesetDetailLayout } from "./ChangesetDetailLayout";
import { ChangesetDetailLayoutSkeleton } from "./ChangesetDetailLayoutSkeleton";
import { useChangesetSidePanel } from "./ChangesetSidePanelProvider";
// TODO: 카드 바탕 스타일 재설계 프로토타입 동안 비활성화 — DigestSection/ReferenceSection
// import { DigestSection } from "./DigestSection";
import { DigestTopicPicker } from "./DigestTopicPicker";
import { EditingProvider, useEditing } from "./EditingProvider";
import { IngestionActions } from "./IngestionActions";
// import { ReferenceSection } from "./ReferenceSection";

const CONFIRM_DISABLED_REASON_KEY = {
  no_candidates: "review.confirm_disabled_no_candidates",
  missing_title: "review.confirm_disabled_missing_title",
  missing_description: "review.confirm_disabled_missing_description",
  empty_label: "review.confirm_disabled_empty_label",
  empty_reference: "review.confirm_disabled_empty_reference",
} as const;

// DIGEST_BODY_FIELDS 메타는 string/string[] 구분을 안 담아(런타임 값으로만
// 판별) — 값이 아직 없는 필드의 표시용 기본값을 고르려면 어느 쪽인지 미리 알아야
// 해서, 스키마상 string[]인 필드만 따로 나열해둔다.
const ARRAY_FIELD_KEYS = new Set(["tradeoff", "alternatives", "branches"]);

// PROTOTYPE(카드 본문 배치 실험) — 보기/편집 모드를 안 나누는 게 이 실험의 핵심
// 판단이라(design-decisions-log.md 참고) 항상 input/textarea이되 평소엔 무입력
// 티가 없게 스타일링한다. weave `Input`은 border·h-9·px-3 같은 chrome을 base로
// 강제해 되돌리는 비용이 커서(Chip이 Button 대신 raw button을 쓰는 것과 같은
// 이유, weave-usage.md) 리스트 항목의 한 줄짜리 input도 raw로 쓴다. 여러 줄
// 필드는 weave에 Textarea 자체가 없어(ChatInput.tsx·ReferenceCandidateCard.tsx
// 도 각자 raw textarea) 마찬가지. 이 프로토타입이 실물로 확정되기 전이라
// 컴포넌트 추출은 미룬다.
// 값 텍스트 색은 fg-primary — body가 title(스캔용 헤드라인)이 아니라 이 카드의
// 판단 대상이라(design-decisions-log.md 참고), title과의 구분은 크기·굵기만으로
// 충분하고 색까지 낮추면 정작 대조해서 읽어야 할 콘텐츠의 대비가 떨어진다.
// overflow-hidden 필수 — 없으면 JS가 높이를 맞추기 전 한 프레임 동안 네이티브
// textarea 기본 스크롤바가 깜빡인다. 최대 높이를 안 두는 건 의도적: 내용이 길어도
// 필드 자체가 스크롤을 갖지 않고 페이지 스크롤에 그대로 얹힌다.
const INVISIBLE_INPUT_CLASSNAME =
  "w-full min-w-0 resize-none overflow-hidden border-none bg-transparent p-0 text-base leading-relaxed text-fg-primary placeholder:text-fg-quaternary focus:outline-none disabled:text-fg-quinary";

// 카드 접힘(읽음 처리)·향후 레퍼런스 섹션 추가 둘 다 필드가 그때그때 DOM에서
// 빠지고 붙으므로, 마운트 시점에 등록하는 방식 대신 방향키를 누른 순간 실제로
// DOM에 있는 필드만 훑는다 — 접힌 카드의 필드는 순회 대상에서 저절로 빠지고,
// 나중에 레퍼런스 필드도 같은 data-nav-field만 붙이면 등록 코드 없이 이
// 흐름에 합류한다. disabled는 확정·버리기 처리 중 카드 전체가 잠기는 잠깐
// 동안이라 포커스가 안 가는데, 그 상태를 순회 대상에서 빼지 않으면 방향키가
// 조용히 안 먹는 것처럼 보인다.
// 커서가 뷰포트 가장자리에 완전히 닿아야 스크롤이 따라가면 그 순간 홱
// 튀는 느낌이 난다 — 가장자리에 닿기 전, 이 여유만큼 남았을 때부터 미리
// 조금씩 따라가게 한다. 위(헤더 아래)·아래 양쪽에 같은 값을 써서 방향에
// 따라 경험이 달라지지 않게 한다.
const SCROLL_EDGE_MARGIN_PX = 24;

function focusAdjacentNavField(
  current: HTMLTextAreaElement,
  direction: "up" | "down",
) {
  const fields = Array.from(
    document.querySelectorAll<HTMLTextAreaElement>(
      "[data-nav-field]:not(:disabled)",
    ),
  );
  const currentIndex = fields.indexOf(current);
  const target = fields[currentIndex + (direction === "up" ? -1 : 1)];
  if (currentIndex === -1 || !target) {
    return;
  }
  // 브라우저 기본 auto-scroll(focus 시 실행)은 스크롤 뷰포트 기준으로만
  // 판단해 sticky 헤더에 가려지는 걸 모르고, 가장자리 도달 여부만 보지
  // "거의 다 왔을 때 조금씩" 같은 여유도 못 준다 — 직접 계산해서 대체한다.
  target.focus({ preventScroll: true });
  const cursor = direction === "up" ? target.value.length : 0;
  target.setSelectionRange(cursor, cursor);

  const scrollArea = document.querySelector<HTMLElement>(
    "[data-main-scroll-area]",
  );
  if (!scrollArea) {
    return;
  }
  const header = document.querySelector<HTMLElement>("[data-sticky-header]");
  const areaRect = scrollArea.getBoundingClientRect();
  const topBound =
    (header?.getBoundingClientRect().bottom ?? areaRect.top) +
    SCROLL_EDGE_MARGIN_PX;
  const bottomBound = areaRect.bottom - SCROLL_EDGE_MARGIN_PX;
  const targetRect = target.getBoundingClientRect();
  if (targetRect.top < topBound) {
    scrollArea.scrollTop -= topBound - targetRect.top;
  } else if (targetRect.bottom > bottomBound) {
    scrollArea.scrollTop += targetRect.bottom - bottomBound;
  }
}

// 여러 줄 필드 안에서 줄바꿈하며 편집할 때 방향키를 뺏기면 안 되므로, 커서가
// 필드의 절대 시작/끝에 있을 때만 다음 필드로 탈출한다 — 첫 줄 중간이면
// 브라우저 기본 동작(그 줄의 시작으로 이동)이 먼저 먹고, 다시 누르면 그때
// 탈출한다(Notion 블록 이동과 같은 2단 동작). title·본문 필드·리스트 항목이
// 모두 이 규칙을 공유해 여기 하나로 뽑아둔다.
function handleBoundaryArrowKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
): boolean {
  if (e.shiftKey) {
    return false;
  }
  const el = e.currentTarget;
  if (e.key === "ArrowUp" && el.selectionStart === 0 && el.selectionEnd === 0) {
    e.preventDefault();
    focusAdjacentNavField(el, "up");
    return true;
  }
  if (
    e.key === "ArrowDown" &&
    el.selectionStart === el.value.length &&
    el.selectionEnd === el.value.length
  ) {
    e.preventDefault();
    focusAdjacentNavField(el, "down");
    return true;
  }
  return false;
}

// scrollHeight 기반 자동 높이 조절 — value가 바뀔 때뿐 아니라 요소 자체의
// 폭이 바뀔 때도 다시 재야 한다. 사이드패널이 열리는 등으로 카드 폭이
// 좁아지면 같은 텍스트라도 줄바꿈 수가 늘어 실제로 더 큰 높이가 필요한데,
// value만 의존성으로 두면 그 경우를 놓쳐 마지막 줄이 overflow-hidden에
// 잘려 사라진다. ResizeObserver는 이 스크립트가 직접 바꾸는 height 변화에도
// 반응해 매번 다시 불리므로, 실제로 폭이 바뀐 경우로만 좁혀서 재귀 호출을
// 막는다.
function useAutoResizeTextarea(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useEffect(
    function resizeToContent() {
      const el = ref.current;
      if (!el) {
        return;
      }
      function resize() {
        if (!el) {
          return;
        }
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
      resize();
      let lastWidth = el.offsetWidth;
      const observer = new ResizeObserver(() => {
        if (!el || el.offsetWidth === lastWidth) {
          return;
        }
        lastWidth = el.offsetWidth;
        resize();
      });
      observer.observe(el);
      return () => observer.disconnect();
    },
    [ref, value],
  );
}

interface DigestFieldTextInputProps {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  placeholder?: string;
  // title·description처럼 카드당 한 번뿐이라 반복해서 읽힐 일이 없는 필수
  // 필드용 — 포커스 여부와 무관하게 항상 placeholder를 보여준다. 본문 필드
  // (선택형)는 기본값(false)을 써서 포커스 게이팅을 유지한다.
  alwaysShowPlaceholder?: boolean;
  maxLength?: number;
  // 제목처럼 타이포가 본문 필드(text-base)와 다른 소비처를 위한 오버라이드 —
  // INVISIBLE_INPUT_CLASSNAME 뒤에 병합되어(cn) 크기·굵기만 갈아끼운다.
  className?: string;
}

function DigestFieldTextInput({
  value,
  disabled,
  onChange,
  placeholder,
  alwaysShowPlaceholder = false,
  maxLength,
  className,
}: DigestFieldTextInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // 리스트 필드(DigestFieldListInput)와 같은 원칙 — 포커스된 필드에만
  // placeholder를 보여준다(본문 필드 기본값). alwaysShowPlaceholder를 받는
  // 필드는 예외 — 카드 훑어볼 때도 "비어있다"는 신호 자체가 필요해서다.
  const [isFocused, setIsFocused] = useState(false);
  useAutoResizeTextarea(ref, value);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onKeyDown={handleBoundaryArrowKeyDown}
      placeholder={isFocused || alwaysShowPlaceholder ? placeholder : undefined}
      maxLength={maxLength}
      rows={1}
      data-nav-field
      className={cn(INVISIBLE_INPUT_CLASSNAME, className)}
    />
  );
}

// 버튼 없이 불릿·넘버 리스트 에디터의 표준 동작으로만 항목을 늘리고 줄인다 —
// Enter는 커서 위치에서 줄을 쪼개 새 항목을 만들고(Notion·Google Docs와 동일),
// 맨 앞에서 Backspace를 누르면 앞 항목 끝에 이어붙으며 이 줄이 사라진다.
// "삭제" 버튼이라는 별도 액션을 안 배워도, 이미 아는 리스트 편집 습관 그대로
// 지우게 된다.
interface DigestFieldListInputProps {
  items: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
  placeholder: string;
}

interface PendingFocus {
  index: number;
  cursor: number;
}

function DigestFieldListInput({
  items,
  disabled,
  onChange,
  placeholder,
}: DigestFieldListInputProps) {
  const itemRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  // 포커스된 줄에만 placeholder를 보여준다 — 안 그러면 Enter로 빈 줄을 여러 개
  // 만들었을 때 같은 안내 문구가 줄마다 반복돼 보인다.
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  // 이 시점엔 아직 렌더가 안 끝나 ref가 없어서, 다음 렌더 후 effect에서
  // focus+커서 위치를 잡는다.
  const pendingFocusRef = useRef<PendingFocus | null>(null);

  useEffect(
    function focusPendingItem() {
      const pending = pendingFocusRef.current;
      if (!pending) {
        return;
      }
      pendingFocusRef.current = null;
      const el = itemRefs.current[pending.index];
      el?.focus();
      el?.setSelectionRange(pending.cursor, pending.cursor);
    },
    [items],
  );

  function setItem(itemIndex: number, next: string) {
    onChange(items.map((item, i) => (i === itemIndex ? next : item)));
  }

  function handleKeyDown(
    itemIndex: number,
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    // 항목도 이제 길면 여러 줄로 늘어날 수 있어(긴 트레이드오프 등) title·본문
    // 필드와 같은 경계 판정을 그대로 쓴다 — 줄 중간이면 그 줄 안에서 먼저
    // 움직이고, 절대 시작/끝에서만 다음 항목/필드로 탈출한다.
    if (handleBoundaryArrowKeyDown(e)) {
      return;
    }
    const input = e.currentTarget;
    if (e.key === "Enter") {
      e.preventDefault();
      const cursor = input.selectionStart ?? items[itemIndex].length;
      const before = items[itemIndex].slice(0, cursor);
      const after = items[itemIndex].slice(cursor);
      const next = [...items];
      next[itemIndex] = before;
      next.splice(itemIndex + 1, 0, after);
      pendingFocusRef.current = { index: itemIndex + 1, cursor: 0 };
      onChange(next);
      return;
    }
    // 맨 앞 커서에서만 병합한다 — 그 외 위치의 Backspace는 브라우저 기본 동작
    // (한 글자 지우기)에 맡긴다. itemIndex가 0이면 위에 합칠 항목이 없어 아무
    // 것도 안 한다(맨 앞 줄까지 지워 리스트를 통째로 비우는 건 여기서 안 다룸).
    if (
      e.key === "Backspace" &&
      itemIndex > 0 &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0
    ) {
      e.preventDefault();
      const mergeCursor = items[itemIndex - 1].length;
      const next = [...items];
      next[itemIndex - 1] = items[itemIndex - 1] + items[itemIndex];
      next.splice(itemIndex, 1);
      pendingFocusRef.current = { index: itemIndex - 1, cursor: mergeCursor };
      onChange(next);
    }
  }

  return (
    <div className="flex flex-col gap-1 pl-2">
      {items.map((item, itemIndex) => (
        <DigestFieldListItem
          key={itemIndex}
          value={item}
          disabled={disabled}
          placeholder={focusedIndex === itemIndex ? placeholder : undefined}
          onRef={(el) => {
            itemRefs.current[itemIndex] = el;
          }}
          onChange={(next) => setItem(itemIndex, next)}
          onKeyDown={(e) => handleKeyDown(itemIndex, e)}
          onFocus={() => setFocusedIndex(itemIndex)}
          onBlur={() =>
            setFocusedIndex((current) =>
              current === itemIndex ? null : current,
            )
          }
        />
      ))}
    </div>
  );
}

interface DigestFieldListItemProps {
  value: string;
  disabled: boolean;
  placeholder?: string;
  onRef: (el: HTMLTextAreaElement | null) => void;
  onChange: (next: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

// 항목 자동 높이 조절은 훅(useAutoResizeTextarea)이라 items.map() 루프
// 안에서 직접 못 쓴다(hooks 규칙) — 항목 하나를 별도 컴포넌트로 떼어내
// 각자 자기 인스턴스에서 훅을 쓰게 한다.
function DigestFieldListItem({
  value,
  disabled,
  placeholder,
  onRef,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
}: DigestFieldListItemProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoResizeTextarea(ref, value);

  return (
    <div className="flex items-start gap-2">
      {/* 텍스트 글리프 "·" 대신 LNB 초안 처리중 점(DraftsNavItem.tsx)과 같은
          Circle+fill-current 조합 — 노션 불릿 정도 크기로 채워진 원이 되게.
          빈 줄이어도 상시 노출 — 포커스된 줄에만 뜨는 placeholder가 "여기
          채울 수 있다"는 신호를 이미 주므로, 불릿까지 숨기지 않아도 빈
          줄이 렌더링 깨진 것처럼 보이지 않는다. items-start+살짝 내림 —
          항목이 길어 여러 줄로 늘어나도 불릿이 문단 전체가 아니라 첫 줄
          기준선에 맞게. 오프셋(mt-2.5=10px)은 첫 줄 라인박스 높이(text-base
          16px·leading-relaxed 1.625=26px)에서 불릿 지름(6px)을 뺀 나머지를
          반으로 나눈 값 — 그래야 26px 줄 안에서 6px 원이 정확히 중앙에 온다. */}
      <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
      <textarea
        ref={(el) => {
          ref.current = el;
          onRef(el);
        }}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={1}
        data-nav-field
        className={INVISIBLE_INPUT_CLASSNAME}
      />
    </div>
  );
}

interface DigestFieldRowProps {
  labelKey: TranslationKey;
  placeholderKey: TranslationKey;
  value: string | string[];
  disabled: boolean;
  onChange: (next: string | string[]) => void;
}

function DigestFieldRow({
  labelKey,
  placeholderKey,
  value,
  disabled,
  onChange,
}: DigestFieldRowProps) {
  const { t } = useTranslation();
  const placeholder = t(placeholderKey);
  return (
    <div className="flex flex-col gap-1">
      <Text as="span" size="sm" weight="medium" color="tertiary">
        {t(labelKey)}
      </Text>
      {Array.isArray(value) ? (
        <DigestFieldListInput
          items={value}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
        />
      ) : (
        <DigestFieldTextInput
          value={value}
          disabled={disabled}
          onChange={onChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

// pending 상태인 ingestion changeset의 편집 화면 — 모든 상태가 URL을 공유하므로
// (changesetDetailRegistry), 확정·버리기 성공 시 별도 이동 없이 getByNumber를
// 무효화하기만 하면 같은 URL이 자연히 ChangesetRecordScreen으로 넘어간다
// (useConfirmReview/useDiscardReview가 그 무효화를 담당).
//
// 확정 페이로드와 확정 차단 조건은 후보 전체를 봐야 나오는 값이라 여기서 편집 상태를
// 통째로 구독한다. 타이핑마다 이 함수는 다시 돌지만 두 섹션 요소는 overrides에
// 의존하지 않아 React 컴파일러가 캐시하므로, 아래 트리는 통째로 건너뛴다.
function IngestionContent() {
  const { t } = useTranslation();
  const spaceId = useCurrentSpaceId();
  const changesetNumber = useChangesetNumber();
  const [review] = useDigestReviewSuspenseQuery(spaceId, changesetNumber);
  const { openTab, closeTab, activeTabId } = useChangesetSidePanel();
  // 모든 다이제스트가 같은 Source 하나를 공유해 탭 id도 하나뿐이라(review.sourceId),
  // "지금 패널에 뜬 게 이 탭이다"만으로는 다이제스트 카드 중 어느 걸 눌러서
  // 열었는지 구분이 안 된다 — 가장 최근에 누른 카드의 index를 따로 들고 있다가
  // activeTabId와 함께 봐야 "이 카드의 트리거가 활성 상태"를 정확히 판정할 수
  // 있다(surface-inventory.md "원문 링크 활성" — 카드 전체가 아니라 트리거
  // 자신만, 배타적으로 활성화).
  const [activeSourceDigestIndex, setActiveSourceDigestIndex] = useState<
    number | null
  >(null);
  // 읽음 표시는 서버에 저장하지 않는 화면 전용 상태 — 이 리뷰 세션 동안만
  // "다 봤으니 접어둔다"는 용도라, changeset 자체의 판정(확정/버리기)과는
  // 무관하다. 읽음 처리 = 접힘 — GitHub PR의 Viewed 체크박스와 같은 동작으로,
  // 본문 필드는 숨기고 헤더(Topic·제목·description, 나중에 피드 미리보기가 될
  // 구역)만 남긴다.
  const [viewedIndices, setViewedIndices] = useState<ReadonlySet<number>>(
    new Set(),
  );

  function toggleViewed(index: number) {
    setViewedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }
  // 훑어볼 땐 빈 옵셔널 본문 필드를 접어두고, 그 카드를 만지기 시작하면(포커스가
  // 카드 안 어딘가로 들어오면) 펼친다 — "항상 5개 다 그린다"는 교정 경로는
  // 유지하되, AI가 채운 값과 사람이 채워야 할 빈칸이 섞여 스캔할 때 텍스트가
  // 과밀해지는 걸 막는다. relatedTarget으로 "포커스가 이 카드를 완전히
  // 벗어났는지"를 판정한다 — 같은 카드 안 다른 필드로 옮겨가는 중간엔 접히면
  // 안 되므로 onBlur만으로는 부족하다.
  const [focusedCardIndex, setFocusedCardIndex] = useState<number | null>(null);
  const overrides = useEditing((state) => state.overrides);
  const dispatch = useEditing((state) => state.dispatch);
  const resetEditing = useEditing((state) => state.reset);
  const {
    digestRows,
    referenceRows,
    dirty,
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
    referenceUpdates,
  } = useMemo(
    () => computeReviewEditingState(review, overrides),
    [review, overrides],
  );
  const reviewTitle = review.sourceTitle ?? t("review.digest_review_title");

  const updateReview = useUpdateReview(spaceId, changesetNumber);
  const confirmReview = useConfirmReview(spaceId, changesetNumber);
  const discardReview = useDiscardReview(spaceId, changesetNumber);
  const showNotificationSoftAsk = useNotificationSoftAsk();

  const locked =
    updateReview.isPending ||
    confirmReview.isPending ||
    discardReview.isPendingAfterDelay;
  const confirmDisabled =
    locked ||
    !hasCandidates ||
    hasEmptyTitle ||
    hasEmptyDescription ||
    hasEmptyLabel ||
    hasEmptyReference;

  const confirmDisabledReasonCode = computeConfirmDisabledReason(
    hasCandidates,
    hasEmptyTitle,
    hasEmptyDescription,
    hasEmptyLabel,
    hasEmptyReference,
  );
  const confirmDisabledReasonText =
    confirmDisabledReasonCode &&
    t(CONFIRM_DISABLED_REASON_KEY[confirmDisabledReasonCode]);

  async function handleConfirm() {
    if (confirmDisabled) {
      return;
    }
    updateReview.reset();
    confirmReview.reset();
    try {
      await runConfirmReview({
        changesetId: review.changesetId,
        dirty,
        digestRows,
        newReferences: referenceRows,
        referenceUpdates,
        updateReview: updateReview.mutateAsync,
        confirmReview: confirmReview.mutateAsync,
        onSaved: resetEditing,
      });
      showNotificationSoftAsk();
    } catch {
      // 전역 토스트(mutationCache.onError)가 이미 띄운다.
    }
  }

  function handleDiscard() {
    if (locked) {
      return;
    }
    discardReview.mutate(
      { changesetId: review.changesetId },
      { onSuccess: () => showNotificationSoftAsk() },
    );
  }

  // 다이제스트가 몇 개든 원본(Source)은 하나뿐이라, id를 sourceId로 고정해
  // 어느 카드에서 눌러도 같은 탭을 열거나 그 탭으로 포커스만 이동한다
  // (surface-inventory.md "하나의 Source를 가리키는 거라 탭이 여러 개일
  // 이유가 없다"). locator 하이라이트·스크롤은 이번 라운드 범위 밖 — 원문
  // 전체를 그대로 보여주는 것까지만.
  //
  // 이미 이 카드가 활성 트리거인 상태에서 다시 누르면 여는 게 아니라 닫는다
  // (토글) — 같은 탭을 여러 카드가 가리키는 구조라 "열기" 액션 하나만 있으면
  // 탭을 닫을 방법이 카드 쪽엔 없다.
  function handleViewSource(index: number) {
    if (activeTabId === review.sourceId && activeSourceDigestIndex === index) {
      closeTab(review.sourceId);
      return;
    }
    setActiveSourceDigestIndex(index);
    openTab({
      id: review.sourceId,
      label: reviewTitle,
      content: (
        <div className="flex flex-col gap-3 p-4">
          <Text as="h2" size="lg" weight="semibold">
            {reviewTitle}
          </Text>
          <Text
            as="p"
            size="sm"
            color="secondary"
            className="whitespace-pre-wrap"
          >
            {review.sourceBody}
          </Text>
        </div>
      ),
    });
  }

  return (
    <ChangesetDetailLayout title={reviewTitle}>
      <ChangesetDetailHeader
        title={reviewTitle}
        changesetNumber={review.changesetNumber}
        status="pending"
        time={review.sourceCreatedAt}
        actions={
          <IngestionActions
            onDiscard={handleDiscard}
            onConfirm={handleConfirm}
            discardPending={discardReview.isPendingAfterDelay}
            discardDisabled={locked}
            confirmDisabled={confirmDisabled}
          />
        }
      />
      {/* 조용한 텍스트 한 줄이라 확정을 막고 있다는 게 잘 안 보였다 — 이미
          AccountDeleteConfirmField 등에서 쓰는 weave Alert(warning)로 바꿔
          "지금 확정이 막혀 있다"는 상태를 놓치기 어렵게 한다. */}
      {confirmDisabledReasonText && (
        <Alert variant="warning">{confirmDisabledReasonText}</Alert>
      )}

      {/*
        DigestSection
        digests={review.digests}
        citedReferences={review.citedReferences}
        disabled={locked}
      */}

      {/*
        ReferenceSection
        digests={review.digests}
        newReferences={review.newReferences}
        citedReferences={review.citedReferences}
        disabled={locked}
      */}

      {/* 카드 사이 구분선을 뺐다 — 헤더 워시가 가까이 있으니 "새 카드 시작" 신호를
          선+워시 둘이 겹쳐서 중복으로 주는 느낌이 났다. 워시(+여백)만으로 그
          역할을 맡긴다. 카드마다 위·아래 여백을 다 갖는 대신 pt-4(페이지 헤더와의
          간격, 고정) 하나만 여기 두고 각 카드는 pb만 갖는다 — "카드 사이 간격"이
          위·아래 두 값의 합이 아니라 앞 카드의 pb 하나로만 정해지므로, 개별 카드가
          접혀도 페이지 헤더와의 간격(위쪽)은 아예 흔들릴 여지가 없다. */}
      <div className="flex flex-col pt-4">
        {review.digests.map((digest, index) => {
          const body = overrides.bodyOverrides.get(index) ?? digest.body;
          const topics = overrides.topicsOverrides.get(index) ?? digest.topics;
          const title = overrides.titleOverrides.get(index) ?? digest.title;
          const description =
            overrides.descriptionOverrides.get(index) ?? digest.description;
          const isSourceActive =
            activeTabId === review.sourceId &&
            activeSourceDigestIndex === index;
          const isViewed = viewedIndices.has(index);
          const isCardFocused = focusedCardIndex === index;
          return (
            <div
              key={index}
              onFocus={(e) => {
                // 액션 버튼 하나하나(또 나중에 늘어날 액션들)를 일일이
                // 제외 목록에 올리는 대신, 실제 편집 필드(data-nav-field —
                // 방향키 이동 대상과 정확히 같은 집합)에 포커스가 들어올
                // 때만 펼친다. ⋯ 메뉴처럼 Portal로 렌더되는 요소는 실제
                // DOM상 카드 밖에 있어도 React 합성 이벤트는 JSX 트리를
                // 따라 여기까지 버블링되는데, data-nav-field는 애초에 그런
                // 요소엔 안 붙어 있어 매번 예외를 추가하지 않아도 걸러진다.
                if (!(e.target as Element).closest("[data-nav-field]")) {
                  return;
                }
                setFocusedCardIndex(index);
              }}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setFocusedCardIndex((current) =>
                    current === index ? null : current,
                  );
                }
              }}
              className={cn(
                "flex flex-col gap-2",
                // 읽음(접힘) 상태는 카드가 3줄로 짧아져서, 본문 있는 카드 기준
                // 여백을 그대로 두면 상대적으로 헐거워 보인다 — 접힌 카드 뒤는
                // 더 촘촘한 피드 리듬이 되도록 좁힌다. pt가 없어진 만큼(원래
                // 이웃 카드 pt 몫까지) pb 값을 두 배로 뒀다.
                isViewed ? "pb-4" : "pb-8",
              )}
            >
              {/* 헤더를 좌우 구조(justify-between)로 분리하고 아주 옅은 배경 워시
                  (bg-fg-primary/5, 테두리·그림자 없음)를 상시 깐다 — "폼처럼 보인다"는
                  문제는 이미 해결됐고, 지금 남은 문제는 반대로 카드 하나하나가 독립된
                  메모가 아니라 이어지는 한 문서처럼 읽히는 것이라 최소한의 상시 구분이
                  필요하다(design-decisions-log.md 참고). 본문(아래)은 배경 없이 그대로
                  둬서 "헤더=조작 단위, 본문=읽는 내용"이라는 구분이 유지된다. */}
              {/* 각진 모서리 — 둥근 모서리는 이 앱에서 클릭 가능한 컨트롤(Chip·Badge·
                  버튼)의 시각 언어라, 여기 쓰면 헤더가 수동적 "영역 표시"가 아니라
                  또 하나의 UI 컨트롤처럼 보인다. */}
              <div className="flex flex-col gap-2 bg-fg-primary/5 px-2 py-2">
                {/* Topic과 우측 액션(타입·미트볼)은 서로 높이가 달라(텍스트 vs
                    Chip vs 아이콘 버튼) items-start로 두면 윗줄이 안 맞아 보인다 —
                    이 줄만 따로 items-center로 정렬한다. */}
                <div className="flex items-center justify-between gap-2">
                  {/* 타입은 상시 노출되지 않는다 — 펼친 상태는 타입별 전용
                      필드(상황/선택 vs 질문/선택지 등)가 이미 본문에서 타입을
                      드러내고, 실제 타입 변경은 "AI가 잘못 분류했을 때 이미 정답을
                      알고 바로잡는" 드문 동작이라 미트볼 메뉴 서브메뉴로 옮겼다
                      (design-reference-log.md ⑨ 참고, 재검토 후 갱신). 다만 읽음
                      처리(접힘) 상태는 본문 자체가 안 보여서 그 단서가 사라지므로,
                      이때만 조용한 읽기 전용 Badge로 다시 보여준다 — 클릭 가능한
                      Chip은 아니다(편집은 여전히 미트볼 전담). 리딩(Topic 왼쪽)에
                      두는 이유는 design-reference-log.md ⑨와 동일 — 가변폭
                      텍스트 뒤에 안 붙어야 지터가 없다. 나중에 액션 버튼이 없는
                      스레드 피드에서는 이 자리 대신 우측 고정 슬롯(MD3 trailing)이
                      더 맞을 수 있다 — 화면마다 다르게 갈 수 있음. */}
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isViewed && (
                      <Badge
                        variant={DIGEST_TYPE_BADGE_VARIANT[body.type]}
                        shape="rounded"
                        className="shrink-0"
                      >
                        {t(DIGEST_TYPE_LABEL_KEY[body.type])}
                      </Badge>
                    )}
                    <DigestTopicPicker
                      topics={topics}
                      disabled={locked}
                      onChange={(next) =>
                        dispatch({
                          type: "digest/setTopics",
                          index,
                          topics: next,
                        })
                      }
                    />
                  </div>
                  {/* 우측은 이제 액션 전용 — 원문 보기·⋯ 메뉴만 남아 자리 성격이
                      더 단순해졌다. */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* 원문 보기 — 삭제와 달리 리뷰 작업의 핵심(원문 대조)이라
                        ⋯ 메뉴 뒤에 숨기지 않고 상시 노출한다. 아이콘은
                        FileText — "패널을 연다"는 동작이 아니라 "원문 문서"라는
                        의미를 담아야 해서(이 버튼은 텍스트 라벨 없이 아이콘 혼자
                        의미를 전달함), 이미 이 앱에서 문서 의미로 쓰는 아이콘을
                        재사용한다(DraftsNavItem·RetrievalMessage). Search는 같은
                        앱에서 이미 "검색 쿼리"라는 다른 뜻으로 쓰이고 있어 피한다.
                        용어는 glossary.md "원본 vs 원문" 참고 — 엔티티 액션은
                        원본, 텍스트를 보는 액션은 원문. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={locked}
                          aria-label={t("review.digest_view_source_action")}
                          onClick={() => handleViewSource(index)}
                          className={cn(
                            "size-6 rounded-full text-fg-tertiary",
                            isSourceActive &&
                              "bg-fg-primary/10 text-fg-primary",
                          )}
                        >
                          <FileText />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t("review.digest_view_source_action")}
                      </TooltipContent>
                    </Tooltip>
                    {/* 읽음 = 접힘(GitHub PR의 Viewed 체크박스와 같은 동작) —
                        Button 대신 weave Checkbox+텍스트를 직접 보더로 감싼다
                        (SpaceDeleteConfirmForm의 Text as="label"+Checkbox
                        조합에 테두리만 얹음). */}
                    <Text
                      as="label"
                      htmlFor={`digest-${index}-viewed`}
                      size="xs"
                      color="tertiary"
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 py-1",
                        isViewed && "bg-fg-primary/10 text-fg-primary",
                      )}
                    >
                      <Checkbox
                        id={`digest-${index}-viewed`}
                        disabled={locked}
                        checked={isViewed}
                        onCheckedChange={() => toggleViewed(index)}
                      />
                      {t("review.digest_viewed_action")}
                    </Text>
                    {/* 삭제 하나뿐이어도 트리거는 hover-reveal이 아니라 상시 노출 —
                        hover-reveal이면 Chip 옆에 빈 자리만 있다가 마우스가 지나갈
                        때 갑자기 아이콘이 뜨는 게 어색했다(SpaceItemMenu·
                        SessionItemMenu의 hover-reveal ⋯와는 다른 선택 — 거긴
                        트리거 옆에 상시 노출되는 형제 요소가 없어서 빈 자리가 안
                        두드러진다). 메뉴 자체(드롭다운 내용)는 클릭 전엔 안 보이는
                        게 당연해 문제없고, 이후 다른 액션이 늘어도 이 자리로
                        흡수된다. */}
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              disabled={locked}
                              aria-label={t("review.digest_menu_label")}
                              className="size-6 rounded-full text-fg-tertiary"
                            >
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {t("review.digest_menu_label")}
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent
                        side="bottom"
                        align="end"
                        className="min-w-44"
                      >
                        {/* 플라이아웃 서브메뉴 — 데스크톱 드롭다운의 표준 다단
                            패턴(design-reference-log.md ⑨ 참고). 트리거 라벨은
                            현재 값을 안 적는다 — 서브메뉴를 열면 선택 표시가
                            현재 값을 바로 보여줘서 트리거에 값까지 넣을 필요가
                            없다. 선택 표시는 Radix RadioItem 기본(좌측 점) 대신
                            weave Select·TopicAddPopover와 같은 우측 체크마크로
                            맞춘다 — 이 앱에서 "지금 선택된 값"은 이미 우측 체크로
                            통일돼 있다. */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <Shapes />
                            {t("review.digest_type_change_action")}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {DIGEST_TYPES.map((type) => (
                              <DropdownMenuItem
                                key={type}
                                className="pr-8"
                                onClick={() =>
                                  dispatch({
                                    type: "digest/setBody",
                                    index,
                                    body: { type },
                                  })
                                }
                              >
                                {t(DIGEST_TYPE_LABEL_KEY[type])}
                                {type === body.type && (
                                  <span className="absolute right-2 flex size-3.5 items-center justify-center">
                                    <Check className="size-4" />
                                  </span>
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                        <DropdownMenuItem
                          variant="danger"
                          onClick={() =>
                            dispatch({ type: "digest/remove", index })
                          }
                        >
                          <Trash2 />
                          {t("common.delete")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {/* Topic↔제목 간격은 부모 gap-2(8px) 그대로 둔다 — 라벨↔값처럼
                    "한 몸"인 관계가 아니라 메타 정보(Topic)와 헤드라인(제목)이라는
                    느슨한 관계라, 4px로 좁히면 라벨↔값과 같은 무게가 돼 그 특별함이
                    희석된다. */}
                <DigestFieldTextInput
                  value={title}
                  disabled={locked}
                  maxLength={DIGEST_TITLE_MAX_LENGTH}
                  placeholder={t("intake.draft_untitled")}
                  alwaysShowPlaceholder
                  onChange={(next) =>
                    dispatch({ type: "digest/setTitle", index, title: next })
                  }
                  className="text-[20px] font-semibold leading-[1.4]"
                />
                {/* description은 헤더 워시 안(Topic·제목과 같은 구역)에 둔다 —
                    여기 셋(Topic·제목·description)이 나중에 피드 미리보기 카드에
                    그대로 노출될 것들이라(07-modeling.md, description은 아직
                    없는 피드용 필드), "이 워시 구역 = 피드로 나갈 미리보기 단위"로
                    묶는 게 "조작 가능한가"보다 더 안정적인 기준이라고 판단했다.
                    제목↔description은 gap-1(4px)로 Topic↔제목(8px)보다 더
                    붙여서, 헤드라인+부제가 한 블록처럼 보이게 한다. title과 같은
                    DigestFieldTextInput을 재사용해 편집 가능하게 하되, className으로
                    weave Text(size="sm" color="tertiary")와 같은 크기·색을 흉내내
                    구조화 필드(판단 대상, fg-primary)보다 낮은 티어를 유지한다.
                    서버 스키마상 필수값(min 1)이라 title과 같은 결로 비면 확정을
                    막는다(hasEmptyDescription). placeholder는 title처럼 명사형
                    "설명 없음"만 상시 노출 — 본문 필드의 질문형 placeholder를
                    쓰면 훑어볼 때 읽을 텍스트가 늘어나는데, title 바로 아래
                    라인이라 title과 같은 톤을 맞추는 게 자연스럽다. */}
                <DigestFieldTextInput
                  value={description}
                  disabled={locked}
                  maxLength={DIGEST_DESCRIPTION_MAX_LENGTH}
                  placeholder={t("review.digest_description_placeholder")}
                  alwaysShowPlaceholder
                  onChange={(next) =>
                    dispatch({
                      type: "digest/setDescription",
                      index,
                      description: next,
                    })
                  }
                  className="-mt-1 text-[14px] leading-[1.5] text-fg-tertiary"
                />
              </div>

              {/* mt-2를 부모 gap-2(제목 위 Topic·타입 줄과의 간격)에 더해, 제목→본문
                  전환이 본문 필드 간 간격(gap-3=12px)보다 넉넉하도록(8+8=16px) 만든다 —
                  더 큰 개념적 전환일수록 여백도 더 커야 순서가 안 뒤집힌다. pl-2는
                  헤더 워시의 좌측 패딩(px-2)과 맞춰 제목과 좌측 정렬을 맞춘다.
                  읽음 처리되면 이 블록 자체를 안 그린다 — 헤더(Topic·제목·
                  description)만 남아 피드 행처럼 접힌 모습이 된다. */}
              {!isViewed && (
                <div className="mt-2 flex flex-col gap-3 pl-2">
                  {DIGEST_BODY_FIELDS[body.type].map((field) => {
                    // constants.ts가 key를 body.type별로 좁혀두지만 여기선 body.type과의
                    // 상관관계가 끊겨 string으로 넓어진다(DigestBodyFields.tsx와 동일 사정) —
                    // 그래서 인덱싱·되쓰기 둘 다 단언이 필요하다.
                    const fieldRecord = body as Record<string, unknown>;
                    const rawValue = fieldRecord[field.key];
                    // 리스트 필드는 한 번이라도 타이핑했다가 다 지우면 [""](항목 1개,
                    // 빈 문자열)로 남는다 — length===0만 보면 이 상태를 "값 있음"으로
                    // 오판해 카드 포커스를 잃어도 계속 펼쳐진 채로 남는다. 항목 전부가
                    // 빈 문자열인지로 판정해야 한다.
                    const isEmpty =
                      rawValue === undefined ||
                      rawValue === null ||
                      (typeof rawValue === "string" &&
                        rawValue.trim() === "") ||
                      (Array.isArray(rawValue) &&
                        rawValue.every((item) => item.trim() === ""));
                    // 항상 5개 다 그린다 — 원문에 없어 비어있는 필드도 조용히 빈 채로
                    // 보여주고 클릭하면 바로 채울 수 있어야, "AI가 놓친 걸 사람이
                    // 채운다"는 교정 경로가 생긴다(design-decisions-log.md 참고).
                    // 빈 string[] 필드는 [](항목 0개)로는 시작할 입력줄 자체가 없어서
                    // [""] 하나로 기본값을 준다 — 실제로 타이핑하기 전까진 이 값이
                    // dispatch되지 않아 서버 상태는 그대로 비어있다.
                    const emptyDefault: string | string[] =
                      ARRAY_FIELD_KEYS.has(field.key) ? [""] : "";
                    const fieldValue = isEmpty
                      ? emptyDefault
                      : (rawValue as string | string[]);
                    // 빈 필드는 카드에 포커스가 없을 때만 높이 0으로 접는다(스캔 중
                    // 텍스트 과밀 방지, DOM에선 안 빠져 교정 경로 유지). disabled는
                    // 접힘과 별개(아래 locked만) — 접힌 필드까지 disabled로 막으면
                    // 방향키가 다음 타겟을 고를 때 "아직 포커스 전이라 disabled인"
                    // 카드의 첫 빈 필드를 후보에서 건너뛴다. 접힌 채로도 포커스는
                    // 받게 두면, 방향키로 도달하는 순간 onFocus가 카드를 펼치며
                    // 자연스럽게 커서가 들어간다.
                    const isFieldVisible = !isEmpty || isCardFocused;
                    return (
                      <div
                        key={field.key}
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-normal ease-out",
                          isFieldVisible
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <DigestFieldRow
                            labelKey={field.labelKey}
                            placeholderKey={field.placeholderKey}
                            value={fieldValue}
                            disabled={locked}
                            onChange={(next) => {
                              const nextBody: typeof body = {
                                ...body,
                                [field.key]: next,
                              };
                              dispatch({
                                type: "digest/setBody",
                                index,
                                body: nextBody,
                              });
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChangesetDetailLayout>
  );
}

// space·number 유효성 검증과 NOT_FOUND 처리는 ChangesetDetailScreen(부모 게이트)이
// 이미 마쳤으므로, 여기서는 이 리뷰 콘텐츠 쿼리(digestReview.get)에 대한 Suspense만
// 책임진다.
export function IngestionScreen() {
  return (
    <Suspense fallback={<ChangesetDetailLayoutSkeleton />}>
      <EditingProvider>
        <IngestionContent />
      </EditingProvider>
    </Suspense>
  );
}

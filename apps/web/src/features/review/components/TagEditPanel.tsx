import { type ReactNode, Suspense, useId, useState } from "react";

import { DIGEST_TAGS_MAX, type DigestTagDraft } from "@nema-io/shared";
import { Badge, Button, cn, Separator, Skeleton, Text } from "@nema-io/weave";
import { XIcon } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { useTranslation } from "@web/lib/tolgee";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/utils/labelSearch";

// 실제 태그 이름 길이가 제각각인 것처럼 스켈레톤 폭도 다양하게 둔다 — 전부
// 같은 폭이면 진짜 데이터가 아니라 UI 장식처럼 보인다.
const SEARCH_SKELETON_WIDTHS = ["w-16", "w-24", "w-12"];

interface TagSearchListProps {
  query: string;
  excludedTagIds: string[];
  existingLabels: string[];
  onSelectExisting: (tag: {
    id: string;
    title: string;
    description: string;
  }) => void;
  onStartCreate: (title: string) => void;
}

// 목록 행은 raw button — 전체 폭 hover 행이라 weave Button의 고정 패딩·
// 타이포가 안 맞는다(weave-usage.md Button 표 "칩·pill 안 버튼" 제외 규칙과
// 같은 이유, TopicSearchList와 동일).
function TagSearchList({
  query,
  excludedTagIds,
  existingLabels,
  onSelectExisting,
  onStartCreate,
}: TagSearchListProps) {
  const { t } = useTranslation();
  const [tagList] = useTagListSuspenseQuery();

  const getLabel = (tag: { title: string }) => tag.title;
  const candidates = filterActiveLabelCandidates(
    tagList.tags,
    getLabel,
    query,
    new Set(excludedTagIds),
  );
  const trimmed = query.trim();
  const hasExactMatch = hasExactLabelMatch(candidates, getLabel, query);
  const canCreateNew =
    trimmed !== "" &&
    !hasExactMatch &&
    !isDuplicateLabelName(trimmed, existingLabels);

  return (
    <>
      <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {candidates.map((tag) => (
          <li key={tag.id}>
            <button
              type="button"
              onClick={() => onSelectExisting(tag)}
              className="flex w-full items-center rounded-sm py-1 text-left hover:bg-surface-raised-hover"
            >
              <Badge variant="outline" shape="rounded" truncated>
                {tag.title}
              </Badge>
            </button>
          </li>
        ))}
        {/* Topic과 같은 원인 분리 — "일치 항목 없음"과 "이미 다 붙어서 후보가
            0개"는 서로 다른 상태라 같은 문구를 쓰면 잘못된 신호가 된다. */}
        {candidates.length === 0 && trimmed === "" && (
          <Text as="li" size="sm" color="tertiary" className="px-2 py-1">
            {t(
              tagList.tags.length > 0
                ? "review.label_search_all_added"
                : "review.label_search_empty",
            )}
          </Text>
        )}
      </ul>
      {trimmed !== "" && !hasExactMatch && (
        <button
          type="button"
          disabled={!canCreateNew}
          onClick={() => onStartCreate(trimmed)}
          className="flex w-full items-center gap-1 rounded-sm py-1 text-left hover:bg-surface-raised-hover disabled:pointer-events-none disabled:text-fg-quinary"
        >
          {/* px-2를 안 두는 이유는 위 후보 행과 동일(TopicSearchList와 같은
              사정) — Badge가 이미 자기 패딩을 갖고 있어 행에 또 주면 이중으로
              밀린다. 국문은 label_create_new_before가 빈 문자열이라 이 값이
              특히 중요하다. */}
          <Text as="span" size="sm">
            {t("review.label_create_new_before")}
          </Text>
          <Badge variant="outline" shape="rounded" truncated>
            {trimmed}
          </Badge>
          <Text as="span" size="sm">
            {t("review.label_create_new_after")}
          </Text>
        </button>
      )}
    </>
  );
}

interface TagEditPanelProps {
  tags: DigestTagDraft[];
  disabled: boolean;
  onChange: (tags: DigestTagDraft[]) => void;
}

// TopicEditPanel과 같은 구조(칩 목록 → 구분선 → 검색)를 따르되, 차이는 하나 —
// Tag는 이름만으로 생성이 안 끝난다(07-modeling.md Tag: description이 재사용
// 판단 기준이라 필수). "새로 만들기"를 누르면 검색 리스트 대신 이름+설명 미니
// 폼으로 전환된다. 이름은 검색행에서 이미 확정한 값이라 다시 편집하게 두지
// 않고 정적 Badge로만 보여준다(같은 값을 두 번 결정하게 만들지 않기 위해) —
// 그래서 폼에서 실제로 받는 입력은 설명 하나뿐이라 거기로 바로 포커스가 간다.
export function TagEditPanel({ tags, disabled, onChange }: TagEditPanelProps) {
  const { t } = useTranslation();
  const descriptionFieldId = useId();
  const [query, setQuery] = useState("");
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const atMax = tags.length >= DIGEST_TAGS_MAX;

  function removeAt(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
  }) {
    onChange([...tags, tag]);
    setQuery("");
  }

  function handleSubmitNew() {
    const title = (creatingTitle ?? "").trim();
    const trimmedDescription = description.trim();
    if (
      title === "" ||
      trimmedDescription === "" ||
      isDuplicateLabelName(
        title,
        tags.map((tag) => tag.title),
      )
    ) {
      return;
    }
    onChange([...tags, { id: null, title, description: trimmedDescription }]);
    setQuery("");
    setCreatingTitle(null);
    setDescription("");
  }

  // atMax·검색·생성 3분기라 하나의 변수로 미리 갈라둔다(연속 삼항 대신).
  let panelBody: ReactNode;
  if (atMax) {
    panelBody = (
      <Text size="xs" color="tertiary" className="px-2 pb-2">
        {t("review.tag_max_reached", { max: DIGEST_TAGS_MAX })}
      </Text>
    );
  } else if (creatingTitle === null) {
    panelBody = (
      <div className="flex flex-col gap-2 px-2 pb-2">
        <Text size="xs" color="tertiary">
          {t("review.label_search_placeholder")}
        </Text>
        <ErrorBoundary
          boundaryName="tag-search"
          fallbackRender={() => (
            <ul>
              <Text as="li" size="sm" color="error" className="px-2 py-1">
                {t("review.label_search_error")}
              </Text>
            </ul>
          )}
        >
          <Suspense
            fallback={
              <ul className="flex flex-col gap-0.5 py-1">
                {SEARCH_SKELETON_WIDTHS.map((width, index) => (
                  <li key={index} className="px-2 py-1">
                    <Skeleton className={cn("h-[19px] rounded-[4px]", width)} />
                  </li>
                ))}
              </ul>
            }
          >
            <TagSearchList
              query={query}
              excludedTagIds={tags
                .map((tag) => tag.id)
                .filter((id): id is string => id !== null)}
              existingLabels={tags.map((tag) => tag.title)}
              onSelectExisting={handleSelectExisting}
              onStartCreate={setCreatingTitle}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    );
  } else {
    panelBody = (
      <div className="flex flex-col gap-3 px-2 pt-2 pb-2">
        <div className="flex flex-col gap-1.5">
          <Text size="sm" weight="medium" color="primary">
            {t("review.tag_create_title_label")}
          </Text>
          <Badge
            variant="outline"
            shape="rounded"
            truncated
            className="self-start"
          >
            {creatingTitle}
          </Badge>
        </div>
        <div className="flex flex-col gap-1.5">
          <Text
            as="label"
            htmlFor={descriptionFieldId}
            size="sm"
            weight="medium"
            color="primary"
          >
            {t("review.tag_create_description_label")}
          </Text>
          {/* weave에 Textarea 컴포넌트가 없어 raw — 이미 앱 전역에 raw
              textarea가 여러 곳(ReferenceEditor 등)에 있어 weave-usage.md
              기준 신설 대상이지만, 그 리팩터는 이 태그 작업 스코프 밖이라
              여기서 새로 벌이지 않는다. label과 색만 SpaceNameField 등
              기존 폼 컨벤션(size sm·weight medium·color primary, label을
              input에 감싸지 않고 htmlFor로 분리)에 맞춰 새로 잡았다 — 값을
              색 있는 label 안에 감싸 넣으면 타이핑한 텍스트가 label의
              tertiary 색을 물려받아 흐리게 보이는 문제가 있었다. */}
          <textarea
            id={descriptionFieldId}
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full min-w-0 resize-none rounded-md border border-border bg-transparent px-3 py-1.5 text-sm text-fg-primary placeholder:text-fg-quaternary focus-visible:border-brand focus-visible:outline-none dark:focus-visible:border-fg-tertiary/70"
          />
        </div>
        <div className="flex justify-end gap-2">
          {/* 취소(common.cancel)가 아니라 뒤로(common.back) — 팝오버를 닫는
              게 아니라 검색 화면으로만 돌아간다. */}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setCreatingTitle(null)}
          >
            {t("common.back")}
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={
              creatingTitle.trim() === "" ||
              description.trim() === "" ||
              isDuplicateLabelName(
                creatingTitle,
                tags.map((tag) => tag.title),
              )
            }
            onClick={handleSubmitNew}
          >
            {t("common.create")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 이름+설명 생성 폼일 땐 이 칩 목록·구분선을 통째로 숨긴다 — 위에
          가릴 게 없는 채로 구분선만 남으면 그 자체가 목적 없는 테두리로
          보인다. */}
      {creatingTitle === null && (
        <>
          <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
            {tags.map((tag, index) => (
              <Badge
                key={tag.id ?? `draft-${index}`}
                variant="outline"
                shape="rounded"
                className="inline-flex items-center gap-1 py-0.5 pr-1"
              >
                {tag.title}
                {/* weave Button 대신 raw button — 칩 안에서 Badge의 색·크기를
                    물려받아야 하는데 Button base가 자기 타이포를 강제해 안 맞는다
                    (weave-usage.md 같은 예외, LabelChipShell과 동일 사정). */}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={t("review.tag_remove_action")}
                  onClick={() => removeAt(index)}
                  className="rounded-full p-0.5 text-current/70 hover:bg-fg-primary/15 disabled:pointer-events-none"
                >
                  <XIcon className="size-3" />
                </button>
              </Badge>
            ))}
            {!atMax && (
              // weave Input 대신 raw — border·h-9·px-3 같은 base chrome을 걷어내면
              // 남는 게 없어서, 칩과 한 행에 이어 붙는 무테두리 인라인 입력엔 안
              // 맞는다(TopicEditPanel과 동일 사정). placeholder는 칩이 쌓일수록
              // 이 인풋이 좁아져 잘릴 수 있어 여기 안 두고 아래 안내문으로 대신한다.
              <input
                value={query}
                disabled={disabled}
                onChange={(e) => setQuery(e.target.value)}
                className="min-w-[4rem] flex-1 border-none bg-transparent text-sm outline-none disabled:pointer-events-none"
              />
            )}
          </div>
          <Separator />
        </>
      )}
      {panelBody}
    </div>
  );
}

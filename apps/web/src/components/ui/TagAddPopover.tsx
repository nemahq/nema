import { Suspense, useState } from "react";
import * as Sentry from "@sentry/react";

import {
  Button,
  ComboboxItem,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
  Textarea,
} from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { useTranslation } from "@web/lib/tolgee";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/utils/labelSearch";

const SEARCH_LIST_CLASSNAME = "flex max-h-48 flex-col gap-0.5 overflow-y-auto";
const SEARCH_ROW_CLASSNAME = "px-2 py-1.5";

interface TagSearchResultsProps {
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

function TagSearchResults({
  query,
  excludedTagIds,
  existingLabels,
  onSelectExisting,
  onStartCreate,
}: TagSearchResultsProps) {
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
  const canStartCreateNew =
    trimmed !== "" &&
    !hasExactMatch &&
    !isDuplicateLabelName(trimmed, existingLabels);

  return (
    <>
      <ul className={SEARCH_LIST_CLASSNAME}>
        {candidates.map((tag) => (
          <li key={tag.id}>
            <ComboboxItem
              onClick={() => onSelectExisting(tag)}
              buttonClassName={SEARCH_ROW_CLASSNAME}
            >
              <Text as="span" size="sm">
                {tag.title}
              </Text>
            </ComboboxItem>
          </li>
        ))}
        {candidates.length === 0 && trimmed === "" && (
          <Text
            as="li"
            size="sm"
            color="tertiary"
            className={SEARCH_ROW_CLASSNAME}
          >
            {t("review.label_search_empty")}
          </Text>
        )}
      </ul>
      {trimmed !== "" && !hasExactMatch && (
        <ComboboxItem
          disabled={!canStartCreateNew}
          onClick={() => onStartCreate(trimmed)}
          buttonClassName={SEARCH_ROW_CLASSNAME}
        >
          <Text
            as="span"
            size="sm"
            className={!canStartCreateNew ? "text-fg-quinary" : undefined}
          >
            {t("review.label_create_new_before")}
            {trimmed}
            {t("review.label_create_new_after")}
          </Text>
        </ComboboxItem>
      )}
    </>
  );
}

interface TagAddPopoverProps {
  disabled: boolean;
  excludedTagIds: string[];
  existingLabels: string[];
  // review-flow는 로컬 draft 배열만 바꾸는 동기 콜백을 넘기고(반환값 없음),
  // reference-flow는 실제 뮤테이션을 무는 Promise를 반환한다 — 실패 시 팝오버를
  // 열어둔 채로 재시도할 수 있어야 해서 반환값을 기다린다.
  onSelectExisting: (tag: {
    id: string;
    title: string;
    description: string;
  }) => unknown;
  onCreateNew: (draft: { title: string; description: string }) => unknown;
}

export function TagAddPopover({
  disabled,
  excludedTagIds,
  existingLabels,
  onSelectExisting,
  onCreateNew,
}: TagAddPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // "새로 만들기" 선택 시 title+description 미니 폼으로 전환된다 — Tag는
  // description이 필수(TagDraftSchema.description min(1))라 이름만으로는
  // 저장이 안 되기 때문(07-modeling Tag 예외 조항).
  const [creatingTitle, setCreatingTitle] = useState<string | null>(null);
  const [description, setDescription] = useState("");

  function reset() {
    setQuery("");
    setCreatingTitle(null);
    setDescription("");
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
    }
  }

  async function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
  }) {
    try {
      await onSelectExisting(tag);
      handleOpenChange(false);
    } catch (error) {
      // review-flow(TagChipRow)는 onSelectExisting이 순수 동기 콜백(onChange)이라
      // MutationCache를 안 거친다 — 토스트가 안 뜨는 경로도 있으므로 항상 직접
      // 보고해 완전히 조용히 삼켜지지 않게 한다. 팝오버는 열어둔다(reference-flow는
      // 검색 결과가 그대로 남아 있어 바로 재시도할 수 있다).
      Sentry.captureException(error);
    }
  }

  async function handleSubmitNew() {
    const title = (creatingTitle ?? "").trim();
    const trimmedDescription = description.trim();
    if (
      title === "" ||
      trimmedDescription === "" ||
      isDuplicateLabelName(title, existingLabels)
    ) {
      return;
    }
    try {
      await onCreateNew({ title, description: trimmedDescription });
      handleOpenChange(false);
    } catch (error) {
      // 생성까지는 됐는데 그 다음 단계(예: reference에 연결)만 실패했을 수 있다 —
      // 검색 화면으로 돌아가면 이미 만들어진 태그가 후보 목록에 뜨니 거기서 다시
      // 고르면 된다(같은 이름으로 재생성을 시도해 막히는 것 대신). description도
      // 같이 지워야 다음 진입 때 title 없이 이전 설명만 남는 상태가 안 된다.
      Sentry.captureException(error);
      setCreatingTitle(null);
      setDescription("");
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="neutral" size="xs" disabled={disabled}>
          <Plus />
          {t("review.tag_add_action")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        {creatingTitle === null ? (
          <>
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("review.label_search_placeholder")}
            />
            <ErrorBoundary
              boundaryName="tag-search"
              fallbackRender={() => (
                <ul className={SEARCH_LIST_CLASSNAME}>
                  <Text
                    as="li"
                    size="sm"
                    color="error"
                    className={SEARCH_ROW_CLASSNAME}
                  >
                    {t("review.label_search_error")}
                  </Text>
                </ul>
              )}
            >
              <Suspense
                fallback={
                  <ul className={SEARCH_LIST_CLASSNAME}>
                    <Text
                      as="li"
                      size="sm"
                      color="tertiary"
                      className={SEARCH_ROW_CLASSNAME}
                    >
                      {t("review.label_search_loading")}
                    </Text>
                  </ul>
                }
              >
                <TagSearchResults
                  query={query}
                  excludedTagIds={excludedTagIds}
                  existingLabels={existingLabels}
                  onSelectExisting={handleSelectExisting}
                  onStartCreate={setCreatingTitle}
                />
              </Suspense>
            </ErrorBoundary>
          </>
        ) : (
          <>
            <Text
              as="label"
              size="xs"
              color="tertiary"
              className="flex flex-col gap-1"
            >
              {t("common.name_label")}
              <Input
                autoFocus
                value={creatingTitle}
                onChange={(e) => setCreatingTitle(e.target.value)}
              />
            </Text>
            <Text
              as="label"
              size="xs"
              color="tertiary"
              className="flex flex-col gap-1"
            >
              {t("review.tag_create_description_label")}
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("review.tag_create_description_placeholder")}
                rows={3}
              />
            </Text>
            <div className="flex justify-end gap-2">
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
                  isDuplicateLabelName(creatingTitle, existingLabels)
                }
                onClick={handleSubmitNew}
              >
                {t("review.tag_create_submit_action")}
              </Button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

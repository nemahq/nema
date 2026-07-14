import { useState } from "react";

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { useTagListQuery } from "@web/features/review/hooks/useTagListQuery";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/features/review/labelSearch";
import { useTranslation } from "@web/lib/tolgee";

interface TagAddPopoverProps {
  disabled: boolean;
  excludedTagIds: string[];
  existingLabels: string[];
  onSelectExisting: (tag: {
    id: string;
    title: string;
    description: string;
  }) => void;
  onCreateNew: (draft: { title: string; description: string }) => void;
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
  const tagListQuery = useTagListQuery(open);

  const getLabel = (tag: { title: string }) => tag.title;
  const candidates = filterActiveLabelCandidates(
    tagListQuery.data?.tags ?? [],
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
  const settled = !tagListQuery.isLoading && !tagListQuery.isError;

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

  function handleSelectExisting(tag: {
    id: string;
    title: string;
    description: string;
  }) {
    onSelectExisting(tag);
    handleOpenChange(false);
  }

  function handleSubmitNew() {
    const title = (creatingTitle ?? "").trim();
    const trimmedDescription = description.trim();
    if (
      title === "" ||
      trimmedDescription === "" ||
      isDuplicateLabelName(title, existingLabels)
    ) {
      return;
    }
    onCreateNew({ title, description: trimmedDescription });
    handleOpenChange(false);
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
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {tagListQuery.isLoading && (
                <li className="px-2 py-1.5 text-sm text-fg-tertiary">
                  {t("review.label_search_loading")}
                </li>
              )}
              {tagListQuery.isError && (
                <li className="px-2 py-1.5 text-sm text-status-error">
                  {t("review.label_search_error")}
                </li>
              )}
              {settled &&
                candidates.map((tag) => (
                  <li key={tag.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectExisting(tag)}
                      className="w-full truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-raised-hover"
                    >
                      {tag.title}
                    </button>
                  </li>
                ))}
              {settled && candidates.length === 0 && trimmed === "" && (
                <li className="px-2 py-1.5 text-sm text-fg-tertiary">
                  {t("review.label_search_empty")}
                </li>
              )}
            </ul>
            {settled && trimmed !== "" && !hasExactMatch && (
              <button
                type="button"
                disabled={!canStartCreateNew}
                onClick={() => setCreatingTitle(trimmed)}
                className="rounded-sm px-2 py-1.5 text-left text-sm text-brand-accent hover:bg-surface-raised-hover disabled:pointer-events-none disabled:opacity-50"
              >
                {t("review.label_create_new_action", { name: trimmed })}
              </button>
            )}
          </>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-xs text-fg-tertiary">
              {t("review.tag_create_title_label")}
              <Input
                autoFocus
                value={creatingTitle}
                onChange={(e) => setCreatingTitle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-tertiary">
              {t("review.tag_create_description_label")}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("review.tag_create_description_placeholder")}
                rows={3}
                className="w-full min-w-0 resize-none rounded-md border border-border bg-transparent px-3 py-1.5 text-sm placeholder:text-fg-tertiary focus-visible:border-brand focus-visible:outline-none dark:focus-visible:border-fg-tertiary/70"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setCreatingTitle(null)}
              >
                {t("review.tag_create_cancel_action")}
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

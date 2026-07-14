import { useState } from "react";

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { useTopicListQuery } from "@web/features/review/hooks/useTopicListQuery";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/features/review/labelSearch";
import { useTranslation } from "@web/lib/tolgee";

interface TopicAddPopoverProps {
  spaceId: string;
  disabled: boolean;
  excludedTopicIds: string[];
  existingLabels: string[];
  onSelectExisting: (topic: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
}

export function TopicAddPopover({
  spaceId,
  disabled,
  excludedTopicIds,
  existingLabels,
  onSelectExisting,
  onCreateNew,
}: TopicAddPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const topicListQuery = useTopicListQuery(spaceId, open);

  const getLabel = (topic: { name: string }) => topic.name;
  const candidates = filterActiveLabelCandidates(
    topicListQuery.data?.topics ?? [],
    getLabel,
    query,
    new Set(excludedTopicIds),
  );
  const trimmed = query.trim();
  const hasExactMatch = hasExactLabelMatch(candidates, getLabel, query);
  const canCreateNew =
    trimmed !== "" &&
    !hasExactMatch &&
    !isDuplicateLabelName(trimmed, existingLabels);
  const settled = !topicListQuery.isLoading && !topicListQuery.isError;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
    }
  }

  function handleSelectExisting(topic: { id: string; name: string }) {
    onSelectExisting(topic);
    handleOpenChange(false);
  }

  function handleCreateNew() {
    if (!canCreateNew) {
      return;
    }
    onCreateNew(trimmed);
    handleOpenChange(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="neutral" size="xs" disabled={disabled}>
          <Plus />
          {t("review.topic_add_action")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("review.label_search_placeholder")}
        />
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
          {topicListQuery.isLoading && (
            <li className="px-2 py-1.5 text-sm text-fg-tertiary">
              {t("review.label_search_loading")}
            </li>
          )}
          {topicListQuery.isError && (
            <li className="px-2 py-1.5 text-sm text-status-error">
              {t("review.label_search_error")}
            </li>
          )}
          {settled &&
            candidates.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  onClick={() => handleSelectExisting(topic)}
                  className="w-full truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-raised-hover"
                >
                  {topic.name}
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
            disabled={!canCreateNew}
            onClick={handleCreateNew}
            className="rounded-sm px-2 py-1.5 text-left text-sm text-brand-accent hover:bg-surface-raised-hover disabled:pointer-events-none disabled:opacity-50"
          >
            {t("review.label_create_new_action", { name: trimmed })}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

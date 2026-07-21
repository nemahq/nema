import { Suspense, useState } from "react";

import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@nema-io/weave";
import { Plus } from "@nema-io/weave/icons";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { useTopicListSuspenseQuery } from "@web/features/review/hooks/useTopicListQuery";
import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "@web/features/review/labelSearch";
import { useTranslation } from "@web/lib/tolgee";

const SEARCH_LIST_CLASSNAME = "flex max-h-48 flex-col gap-0.5 overflow-y-auto";

interface TopicSearchResultsProps {
  spaceId: string;
  query: string;
  excludedTopicIds: string[];
  existingLabels: string[];
  onSelectExisting: (topic: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
}

function TopicSearchResults({
  spaceId,
  query,
  excludedTopicIds,
  existingLabels,
  onSelectExisting,
  onCreateNew,
}: TopicSearchResultsProps) {
  const { t } = useTranslation();
  const [topicList] = useTopicListSuspenseQuery(spaceId);

  const getLabel = (topic: { name: string }) => topic.name;
  const candidates = filterActiveLabelCandidates(
    topicList.topics,
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

  return (
    <>
      <ul className={SEARCH_LIST_CLASSNAME}>
        {candidates.map((topic) => (
          <li key={topic.id}>
            <button
              type="button"
              onClick={() => onSelectExisting(topic)}
              className="w-full truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-raised-hover"
            >
              {topic.name}
            </button>
          </li>
        ))}
        {candidates.length === 0 && trimmed === "" && (
          <Text as="li" size="sm" color="tertiary" className="px-2 py-1.5">
            {t("review.label_search_empty")}
          </Text>
        )}
      </ul>
      {trimmed !== "" && !hasExactMatch && (
        <button
          type="button"
          disabled={!canCreateNew}
          onClick={() => onCreateNew(trimmed)}
          className="rounded-sm px-2 py-1.5 text-left text-sm text-brand-accent hover:bg-surface-raised-hover disabled:pointer-events-none disabled:text-fg-quaternary"
        >
          {t("review.label_create_new_action", { name: trimmed })}
        </button>
      )}
    </>
  );
}

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

  function handleCreateNew(name: string) {
    onCreateNew(name);
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
        <ErrorBoundary
          boundaryName="topic-search"
          fallbackRender={() => (
            <ul className={SEARCH_LIST_CLASSNAME}>
              <Text as="li" size="sm" color="error" className="px-2 py-1.5">
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
                  className="px-2 py-1.5"
                >
                  {t("review.label_search_loading")}
                </Text>
              </ul>
            }
          >
            <TopicSearchResults
              spaceId={spaceId}
              query={query}
              excludedTopicIds={excludedTopicIds}
              existingLabels={existingLabels}
              onSelectExisting={handleSelectExisting}
              onCreateNew={handleCreateNew}
            />
          </Suspense>
        </ErrorBoundary>
      </PopoverContent>
    </Popover>
  );
}

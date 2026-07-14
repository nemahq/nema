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
import { useTranslation } from "@web/lib/tolgee";

interface TopicAddPopoverProps {
  disabled: boolean;
  excludedTopicIds: string[];
  onSelectExisting: (topic: { id: string; name: string }) => void;
  onCreateNew: (name: string) => void;
}

export function TopicAddPopover({
  disabled,
  excludedTopicIds,
  onSelectExisting,
  onCreateNew,
}: TopicAddPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const topicListQuery = useTopicListQuery(open);

  const trimmed = query.trim();
  const excluded = new Set(excludedTopicIds);
  const candidates = (topicListQuery.data?.topics ?? []).filter(
    (topic) =>
      topic.status === "active" &&
      !excluded.has(topic.id) &&
      topic.name.toLowerCase().includes(trimmed.toLowerCase()),
  );
  const hasExactMatch = candidates.some(
    (topic) => topic.name.toLowerCase() === trimmed.toLowerCase(),
  );

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
    if (trimmed === "") {
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
          {candidates.map((topic) => (
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
          {candidates.length === 0 && trimmed === "" && (
            <li className="px-2 py-1.5 text-sm text-fg-tertiary">
              {t("review.label_search_empty")}
            </li>
          )}
        </ul>
        {trimmed !== "" && !hasExactMatch && (
          <button
            type="button"
            onClick={handleCreateNew}
            className="rounded-sm px-2 py-1.5 text-left text-sm text-brand-accent hover:bg-surface-raised-hover"
          >
            {t("review.label_create_new_action", { name: trimmed })}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

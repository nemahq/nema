import { DIGEST_TOPICS_MAX, type DigestTopicDraft } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { DraftLabelChip } from "./DraftLabelChip";
import { RegisteredLabelChip } from "./RegisteredLabelChip";
import { TopicAddPopover } from "./TopicAddPopover";

interface TopicChipRowProps {
  spaceId: string;
  topics: DigestTopicDraft[];
  disabled: boolean;
  onChange: (topics: DigestTopicDraft[]) => void;
}

export function TopicChipRow({
  spaceId,
  topics,
  disabled,
  onChange,
}: TopicChipRowProps) {
  const { t } = useTranslation();

  function replaceAt(index: number, next: DigestTopicDraft) {
    onChange(topics.map((topic, i) => (i === index ? next : topic)));
  }

  function removeAt(index: number) {
    onChange(topics.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {topics.map((topic, index) =>
        topic.id === null ? (
          <DraftLabelChip
            key={`draft-${index}`}
            label={topic.name}
            variant="brand"
            disabled={disabled}
            removeAriaLabel={t("review.topic_remove_action")}
            onNameChange={(name) => replaceAt(index, { ...topic, name })}
            onRemove={() => removeAt(index)}
          />
        ) : (
          <RegisteredLabelChip
            key={topic.id}
            label={topic.name}
            variant="brand"
            disabled={disabled}
            removeAriaLabel={t("review.topic_remove_action")}
            onRemove={() => removeAt(index)}
          />
        ),
      )}
      <TopicAddPopover
        spaceId={spaceId}
        disabled={disabled || topics.length >= DIGEST_TOPICS_MAX}
        excludedTopicIds={topics
          .map((topic) => topic.id)
          .filter((id): id is string => id !== null)}
        existingLabels={topics.map((topic) => topic.name)}
        onSelectExisting={(topic) =>
          onChange([...topics, { id: topic.id, name: topic.name }])
        }
        onCreateNew={(name) => onChange([...topics, { id: null, name }])}
      />
    </div>
  );
}

import { DIGEST_TAGS_MAX, type DigestTagDraft } from "@nema-io/shared";

import { useTranslation } from "@web/lib/tolgee";

import { DraftLabelChip } from "./DraftLabelChip";
import { RegisteredLabelChip } from "./RegisteredLabelChip";
import { TagAddPopover } from "./TagAddPopover";

interface TagChipRowProps {
  tags: DigestTagDraft[];
  disabled: boolean;
  onChange: (tags: DigestTagDraft[]) => void;
}

export function TagChipRow({ tags, disabled, onChange }: TagChipRowProps) {
  const { t } = useTranslation();

  function replaceAt(index: number, next: DigestTagDraft) {
    onChange(tags.map((tag, i) => (i === index ? next : tag)));
  }

  function removeAt(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag, index) =>
        tag.id === null ? (
          <DraftLabelChip
            key={`draft-${index}`}
            label={tag.title}
            variant="neutral"
            disabled={disabled}
            removeAriaLabel={t("review.tag_remove_action")}
            onNameChange={(title) => replaceAt(index, { ...tag, title })}
            onRemove={() => removeAt(index)}
          />
        ) : (
          <RegisteredLabelChip
            key={tag.id}
            label={tag.title}
            variant="neutral"
            disabled={disabled}
            removeAriaLabel={t("review.tag_remove_action")}
            onRemove={() => removeAt(index)}
          />
        ),
      )}
      <TagAddPopover
        disabled={disabled || tags.length >= DIGEST_TAGS_MAX}
        excludedTagIds={tags
          .map((tag) => tag.id)
          .filter((id): id is string => id !== null)}
        existingLabels={tags.map((tag) => tag.title)}
        onSelectExisting={(tag) => onChange([...tags, tag])}
        onCreateNew={(draft) => onChange([...tags, { id: null, ...draft }])}
      />
    </div>
  );
}

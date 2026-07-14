import {
  DIGEST_TAGS_MAX,
  DIGEST_TOPICS_MAX,
  DIGEST_TYPES,
  type DigestTagDraft,
  type DigestTopicDraft,
} from "@nema-io/shared";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import {
  DIGEST_BODY_FIELDS,
  DIGEST_TYPE_LABEL,
  isDigestType,
} from "@web/features/review/constants";
import type {
  ReviewCitedReference,
  ReviewDigest,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { EditableLabelChip } from "./EditableLabelChip";
import { TagAddPopover } from "./TagAddPopover";
import { TopicAddPopover } from "./TopicAddPopover";

function bodyFieldValues(
  body: ReviewDigest["body"],
): { label: string; value: string }[] {
  return DIGEST_BODY_FIELDS[body.type]
    .map(({ key, label }) => {
      const fieldValue = (body as Record<string, unknown>)[key];
      if (
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === ""
      ) {
        return null;
      }
      return {
        label,
        value: Array.isArray(fieldValue)
          ? fieldValue.join(" · ")
          : String(fieldValue),
      };
    })
    .filter((row): row is { label: string; value: string } => row !== null);
}

interface DigestCandidateCardProps {
  spaceId: string;
  digest: ReviewDigest;
  title: string;
  body: ReviewDigest["body"];
  topics: DigestTopicDraft[];
  tags: DigestTagDraft[];
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
  onTitleChange: (title: string) => void;
  onBodyChange: (body: ReviewDigest["body"]) => void;
  onTopicsChange: (topics: DigestTopicDraft[]) => void;
  onTagsChange: (tags: DigestTagDraft[]) => void;
  onRemove: () => void;
}

export function DigestCandidateCard({
  spaceId,
  digest,
  title,
  body,
  topics,
  tags,
  citedReferences,
  disabled,
  onTitleChange,
  onBodyChange,
  onTopicsChange,
  onTagsChange,
  onRemove,
}: DigestCandidateCardProps) {
  const { t } = useTranslation();
  const bodyRows = bodyFieldValues(body);
  const cited = digest.referenceIds
    .map((id) => citedReferences.find((reference) => reference.id === id))
    .filter((reference): reference is ReviewCitedReference =>
      Boolean(reference),
    );

  function updateTopicAt(index: number, next: DigestTopicDraft): void {
    onTopicsChange(topics.map((topic, i) => (i === index ? next : topic)));
  }

  function removeTopicAt(index: number): void {
    onTopicsChange(topics.filter((_, i) => i !== index));
  }

  function updateTagAt(index: number, next: DigestTagDraft): void {
    onTagsChange(tags.map((tag, i) => (i === index ? next : tag)));
  }

  function removeTagAt(index: number): void {
    onTagsChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Select
            value={body.type}
            onValueChange={(type) => {
              // 타입을 바꾸면 새 타입의 빈 body로 갈아끼운다 — 이전 타입 전용
              // 필드는 판별자가 달라 그대로 버려진다(review-flow.md "타입 변경 시 필드 초기화").
              if (isDigestType(type)) {
                onBodyChange({ type });
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label={t("review.digest_type_label")}
              className="h-8 w-28 cursor-pointer text-xs shadow-none dark:shadow-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIGEST_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="cursor-pointer">
                  {DIGEST_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={disabled}
            placeholder={t("review.digest_title_placeholder")}
            aria-invalid={title.trim() === ""}
          />
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={disabled}
          aria-label={t("review.digest_remove_action")}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <p className="text-sm text-fg-secondary">{digest.description}</p>

      {bodyRows.length > 0 && (
        <dl className="flex flex-col gap-1.5 rounded-md bg-surface-card p-3 text-sm">
          {bodyRows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="w-20 shrink-0 text-fg-tertiary">{row.label}</dt>
              <dd className="min-w-0 flex-1 text-fg-primary">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {topics.map((topic, index) =>
          topic.id !== null ? (
            <EditableLabelChip
              key={topic.id}
              label={topic.name}
              readOnly
              disabled={disabled}
              variant="brand"
              removeAriaLabel={t("review.topic_remove_action")}
              onRemove={() => removeTopicAt(index)}
            />
          ) : (
            <EditableLabelChip
              key={`new-topic-${index}`}
              label={topic.name}
              readOnly={false}
              disabled={disabled}
              variant="brand"
              removeAriaLabel={t("review.topic_remove_action")}
              onNameChange={(name) => updateTopicAt(index, { ...topic, name })}
              onRemove={() => removeTopicAt(index)}
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
            onTopicsChange([...topics, { id: topic.id, name: topic.name }])
          }
          onCreateNew={(name) =>
            onTopicsChange([...topics, { id: null, name }])
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag, index) =>
          tag.id !== null ? (
            <EditableLabelChip
              key={tag.id}
              label={tag.title}
              readOnly
              disabled={disabled}
              variant="neutral"
              removeAriaLabel={t("review.tag_remove_action")}
              onRemove={() => removeTagAt(index)}
            />
          ) : (
            <EditableLabelChip
              key={`new-tag-${index}`}
              label={tag.title}
              readOnly={false}
              disabled={disabled}
              variant="neutral"
              removeAriaLabel={t("review.tag_remove_action")}
              onNameChange={(title) => updateTagAt(index, { ...tag, title })}
              onRemove={() => removeTagAt(index)}
            />
          ),
        )}
        <TagAddPopover
          disabled={disabled || tags.length >= DIGEST_TAGS_MAX}
          excludedTagIds={tags
            .map((tag) => tag.id)
            .filter((id): id is string => id !== null)}
          existingLabels={tags.map((tag) => tag.title)}
          onSelectExisting={(tag) => onTagsChange([...tags, tag])}
          onCreateNew={(draft) =>
            onTagsChange([...tags, { id: null, ...draft }])
          }
        />
      </div>

      {cited.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {cited.map((reference) => (
            <Badge key={reference.id} variant="info">
              {reference.title}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

import { Badge, Button, Input } from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import {
  DIGEST_BODY_FIELDS,
  DIGEST_TYPE_LABEL,
} from "@web/features/review/constants";
import type {
  ReviewCitedReference,
  ReviewDigest,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

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
  digest: ReviewDigest;
  title: string;
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
  onTitleChange: (title: string) => void;
  onRemove: () => void;
}

export function DigestCandidateCard({
  digest,
  title,
  citedReferences,
  disabled,
  onTitleChange,
  onRemove,
}: DigestCandidateCardProps) {
  const { t } = useTranslation();
  const bodyRows = bodyFieldValues(digest.body);
  const cited = digest.referenceIds
    .map((id) => citedReferences.find((reference) => reference.id === id))
    .filter((reference): reference is ReviewCitedReference =>
      Boolean(reference),
    );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Badge variant="neutral" className="w-fit">
            {DIGEST_TYPE_LABEL[digest.body.type]}
          </Badge>
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

      {(digest.topics.length > 0 || cited.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {digest.topics.map((topic) => (
            <Badge key={topic} variant="brand">
              {topic}
            </Badge>
          ))}
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

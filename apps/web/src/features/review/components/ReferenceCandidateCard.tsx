import { Badge, Button } from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import type { ReviewNewReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceCandidateCardProps {
  reference: ReviewNewReference;
  disabled: boolean;
  onRemove: () => void;
}

export function ReferenceCandidateCard({
  reference,
  disabled,
  onRemove,
}: ReferenceCandidateCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Badge variant="neutral">{reference.type}</Badge>
          <span className="min-w-0 truncate text-sm font-medium text-fg-primary">
            {reference.title}
          </span>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={disabled}
          aria-label={t("review.reference_remove_action")}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
      <p className="text-sm text-fg-secondary">{reference.body}</p>
      {reference.externalUrls.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {reference.externalUrls.map((url) => (
            <li key={url} className="truncate text-xs text-brand-accent">
              {url}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import {
  REFERENCE_BODY_MAX_LENGTH,
  REFERENCE_TITLE_MAX_LENGTH,
  REFERENCE_TYPES,
} from "@nema-io/shared";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import {
  isReferenceType,
  REFERENCE_TYPE_LABEL,
} from "@web/features/review/constants";
import type { ReviewNewReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceCandidateCardProps {
  reference: ReviewNewReference;
  disabled: boolean;
  onChange: (next: ReviewNewReference) => void;
  onRemove: () => void;
}

export function ReferenceCandidateCard({
  reference,
  disabled,
  onChange,
  onRemove,
}: ReferenceCandidateCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Select
            value={reference.type}
            onValueChange={(type) => {
              if (isReferenceType(type)) {
                onChange({ ...reference, type });
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger
              aria-label={t("review.reference_type_label")}
              className="h-8 w-28 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFERENCE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {REFERENCE_TYPE_LABEL[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={reference.title}
            onChange={(e) => onChange({ ...reference, title: e.target.value })}
            disabled={disabled}
            maxLength={REFERENCE_TITLE_MAX_LENGTH}
            placeholder={t("review.reference_title_placeholder")}
            aria-invalid={reference.title.trim() === ""}
          />
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
      <textarea
        value={reference.body}
        onChange={(e) => onChange({ ...reference, body: e.target.value })}
        disabled={disabled}
        placeholder={t("review.reference_body_placeholder")}
        rows={3}
        maxLength={REFERENCE_BODY_MAX_LENGTH}
        aria-invalid={reference.body.trim() === ""}
        className="w-full min-w-0 resize-none rounded-md border border-border bg-transparent px-3 py-1.5 text-sm placeholder:text-fg-quaternary focus-visible:border-brand focus-visible:outline-none aria-invalid:border-status-error disabled:text-fg-quaternary dark:focus-visible:border-fg-tertiary/70"
      />
      {reference.externalUrls.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {reference.externalUrls.map((url) => (
            <Text
              key={url}
              as="li"
              size="xs"
              color="brand"
              className="truncate"
            >
              {url}
            </Text>
          ))}
        </ul>
      )}
    </div>
  );
}

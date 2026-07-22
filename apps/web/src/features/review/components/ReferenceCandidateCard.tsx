import { useState } from "react";

import { REFERENCE_TITLE_MAX_LENGTH } from "@nema-io/shared";
import { cn, Text } from "@nema-io/weave";

import type { ReviewNewReference } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { DigestTextField } from "./DigestTextField";
import { InvisibleTextarea } from "./InvisibleTextarea";
import { ReferenceCardHeader } from "./ReferenceCardHeader";

interface ReferenceCandidateCardProps {
  reference: ReviewNewReference;
  disabled: boolean;
  onChange: (next: ReviewNewReference) => void;
  onRemove: () => void;
}

// DigestCandidateCard와 같은 전제 — 헤더에만 워시를 두고 본문은 배경 없이 그대로
// 둔다. 외부 링크는 Digest 쪽도 아직 없어 이번 라운드는 같이 뺀다. diff(기존
// 설명·바뀔 설명) 케이스는 ReferenceMergeCard가 그대로 맡아 이 카드는 신규 후보만
// 다룬다.
export function ReferenceCandidateCard({
  reference,
  disabled,
  onChange,
  onRemove,
}: ReferenceCandidateCardProps) {
  // Digest와 같은 이유로 화면 전용 상태 — 서버로도 부모로도 안 올린다.
  const [viewed, setViewed] = useState(false);
  const { t } = useTranslation();

  return (
    <div className={cn("flex flex-col gap-2", viewed ? "pb-4" : "pb-8")}>
      <div className="flex flex-col gap-2 bg-fg-primary/5 px-2 py-2">
        <ReferenceCardHeader
          referenceKey={reference.key}
          type={reference.type}
          disabled={disabled}
          viewed={viewed}
          onToggleViewed={() => setViewed((current) => !current)}
          onChangeType={(type) => onChange({ ...reference, type })}
          onRemove={onRemove}
        />
        <InvisibleTextarea
          value={reference.title}
          disabled={disabled}
          maxLength={REFERENCE_TITLE_MAX_LENGTH}
          placeholder={t("review.reference_title_placeholder")}
          onChange={(next) => onChange({ ...reference, title: next })}
          className="text-[20px] font-semibold leading-[1.4]"
        />
      </div>

      {!viewed && (
        <div className="mt-2 flex flex-col gap-1 pl-2">
          <Text as="span" size="sm" weight="medium" color="tertiary">
            {t("review.reference_body_label")}
          </Text>
          <DigestTextField
            text={reference.body}
            disabled={disabled}
            placeholder={t("review.reference_body_placeholder")}
            onChange={(next) => onChange({ ...reference, body: next })}
          />
        </div>
      )}
    </div>
  );
}

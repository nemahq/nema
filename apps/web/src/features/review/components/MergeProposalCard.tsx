import type { DigestBody, DigestDraft, DigestType } from "@nema-io/shared";
import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import { cn, Text } from "@nema-io/weave";

import {
  DIGEST_BODY_FIELDS,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import {
  readDigestBodyFieldValue,
  resolveCommittedValue,
} from "@web/features/review/digestBodyFieldValue";
import {
  DIGEST_DESCRIPTION_FIELD_CLASS,
  DIGEST_TITLE_FIELD_CLASS,
} from "@web/features/review/digestFieldTypography";
import { useRegisteredBufferedField } from "@web/features/review/hooks/useRegisteredBufferedField";
import { resetDigestBodyForType } from "@web/features/review/resetDigestBodyForType";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestTypePicker } from "./DigestTypePicker";
import { InvisibleTextarea } from "./InvisibleTextarea";
import { MergeDraftBodyField } from "./MergeDraftBodyField";

interface MergeProposalCardProps {
  draft: DigestDraft;
  disabled: boolean;
  onChange: (next: DigestDraft) => void;
  registerPendingCommit: (commit: () => void) => () => void;
}

// 관계 판정 화면(중복/병합)의 병합 제안 카드 — DigestCandidateCard와 같은 시각
// 언어(CandidateCardFrame, 타입·본문 필드)를 쓰지만 그 카드의 편집 경로
// (ReviewDraftProvider dispatch, digestId로 여러 항목 중 하나를 가리키는 구조)는
// 재사용하지 않는다. 이 화면은 다이제스트 하나짜리 1회성 확정(리뷰처럼 여러 번
// 저장·재조회하지 않음, 확정 전까지 자동 저장도 없음)이라 로컬 상태로 충분하고,
// 오히려 그 dispatch 트리를 그대로 끌어오면 이 화면과 무관한 digest-review 자동
// 저장·undo 스택에 얹히게 된다.
export function MergeProposalCard({
  draft,
  disabled,
  onChange,
  registerPendingCommit,
}: MergeProposalCardProps) {
  const { t } = useTranslation();

  const titleField = useRegisteredBufferedField(
    draft.title,
    (next) => onChange({ ...draft, title: next }),
    registerPendingCommit,
  );
  const descriptionField = useRegisteredBufferedField(
    draft.description,
    (next) => onChange({ ...draft, description: next }),
    registerPendingCommit,
  );

  function handleChangeType(next: DigestType) {
    onChange({ ...draft, body: resetDigestBodyForType(next) });
  }

  function handleChangeBodyField(
    key: DigestBodyFieldKey,
    fieldValue: string | string[],
  ): void {
    const body: DigestBody = { ...draft.body, [key]: fieldValue };
    onChange({ ...draft, body });
  }

  return (
    <CandidateCardFrame
      viewed={false}
      className="rounded-lg border border-border p-2"
      wash={
        <>
          <div className="flex items-center gap-2">
            <DigestTypePicker
              type={draft.body.type}
              disabled={disabled}
              onChangeType={handleChangeType}
            />
            <InvisibleTextarea
              value={titleField.value}
              disabled={disabled}
              maxLength={DIGEST_TITLE_MAX_LENGTH}
              placeholder={t("intake.draft_untitled")}
              onChange={titleField.setValue}
              onBlur={titleField.commitNow}
              className={cn("min-w-0 flex-1", DIGEST_TITLE_FIELD_CLASS)}
            />
          </div>
          <InvisibleTextarea
            value={descriptionField.value}
            disabled={disabled}
            maxLength={DIGEST_DESCRIPTION_MAX_LENGTH}
            placeholder={t("review.digest_description_placeholder")}
            onChange={descriptionField.setValue}
            onBlur={descriptionField.commitNow}
            className={cn("-mt-1", DIGEST_DESCRIPTION_FIELD_CLASS)}
          />
        </>
      }
    >
      <div className="mt-2 flex flex-col gap-3 pl-2">
        {DIGEST_BODY_FIELDS[draft.body.type].map((field) => {
          const stored = readDigestBodyFieldValue(draft.body, field.key);
          const fieldValue = resolveCommittedValue(stored, field.kind);

          return (
            <div key={field.key} className="flex flex-col gap-1">
              <Text as="span" size="sm" weight="medium" color="tertiary">
                {t(field.labelKey)}
              </Text>
              <MergeDraftBodyField
                kind={field.kind}
                value={fieldValue}
                disabled={disabled}
                placeholder={t(field.placeholderKey)}
                registerPendingCommit={registerPendingCommit}
                onCommit={(next) => handleChangeBodyField(field.key, next)}
              />
            </div>
          );
        })}
      </div>
    </CandidateCardFrame>
  );
}

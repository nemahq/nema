import type { DigestBody, DigestDraft, DigestType } from "@nema-io/shared";
import {
  DIGEST_DESCRIPTION_MAX_LENGTH,
  DIGEST_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import { DIGEST_BODY_FIELDS } from "@web/features/review/constants";
import {
  readDigestBodyFieldValue,
  resolveCommittedValue,
} from "@web/features/review/digestBodyFieldValue";
import { useTranslation } from "@web/lib/tolgee";

import { CandidateCardFrame } from "./CandidateCardFrame";
import { DigestListField } from "./DigestListField";
import { DigestTextField } from "./DigestTextField";
import { DigestTypePicker } from "./DigestTypePicker";
import { InvisibleTextarea } from "./InvisibleTextarea";

interface MergeProposalCardProps {
  draft: DigestDraft;
  disabled: boolean;
  onChange: (next: DigestDraft) => void;
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
}: MergeProposalCardProps) {
  const { t } = useTranslation();

  function handleChangeType(next: DigestType) {
    // DigestTypePicker(설명 참고)와 같은 규칙 — 타입이 바뀌면 이전 타입 전용
    // 본문 필드는 전부 비운다.
    const body: DigestBody = { type: next };
    onChange({ ...draft, body });
  }

  function handleChangeBodyField(
    key: string,
    fieldValue: string | string[],
  ): void {
    const body: DigestBody = { ...draft.body, [key]: fieldValue };
    onChange({ ...draft, body });
  }

  return (
    <CandidateCardFrame
      viewed={false}
      wash={
        <>
          <div className="flex items-center gap-2">
            <DigestTypePicker
              type={draft.body.type}
              disabled={disabled}
              onChangeType={handleChangeType}
            />
            <InvisibleTextarea
              value={draft.title}
              disabled={disabled}
              maxLength={DIGEST_TITLE_MAX_LENGTH}
              placeholder={t("intake.draft_untitled")}
              onChange={(next) => onChange({ ...draft, title: next })}
              className="min-w-0 flex-1 text-[20px] font-semibold leading-[1.4]"
            />
          </div>
          <InvisibleTextarea
            value={draft.description}
            disabled={disabled}
            maxLength={DIGEST_DESCRIPTION_MAX_LENGTH}
            placeholder={t("review.digest_description_placeholder")}
            onChange={(next) => onChange({ ...draft, description: next })}
            className="-mt-1 text-[14px] leading-[1.5] text-fg-tertiary"
          />
        </>
      }
    >
      <div className="mt-2 flex flex-col gap-3 pl-2">
        {DIGEST_BODY_FIELDS[draft.body.type].map((field) => {
          const stored = readDigestBodyFieldValue(draft.body, field.key);
          const fieldValue = resolveCommittedValue(stored, field.kind);
          const placeholder = t(field.placeholderKey);

          return (
            <div key={field.key} className="flex flex-col gap-1">
              <Text as="span" size="sm" weight="medium" color="tertiary">
                {t(field.labelKey)}
              </Text>
              {field.kind === "text" ? (
                <DigestTextField
                  text={typeof fieldValue === "string" ? fieldValue : ""}
                  disabled={disabled}
                  placeholder={placeholder}
                  onChange={(next) => handleChangeBodyField(field.key, next)}
                />
              ) : (
                <DigestListField
                  items={Array.isArray(fieldValue) ? fieldValue : [fieldValue]}
                  disabled={disabled}
                  placeholder={placeholder}
                  onChange={(next) => handleChangeBodyField(field.key, next)}
                />
              )}
            </div>
          );
        })}
      </div>
    </CandidateCardFrame>
  );
}

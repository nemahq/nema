import { cn, Text } from "@nema-io/weave";

import type {
  DigestBodyFieldKey,
  DigestBodyFieldKind,
} from "@web/features/review/constants";
import {
  isDigestBodyFieldBlank,
  readDigestBodyFieldValue,
  resolveCommittedValue,
} from "@web/features/review/digestBodyFieldValue";
import { useDraftField } from "@web/features/review/hooks/useDraftField";
import type { ReviewDigest } from "@web/features/review/types";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DigestListField } from "./DigestListField";
import { DigestTextField } from "./DigestTextField";
import { useReviewDraftContext } from "./ReviewDraftProvider";

// 리스트 값은 매 편집마다 새 배열이라 참조 비교로는 늘 "바뀌었다"가 된다.
function isSameFieldValue(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return Object.is(a, b);
}

interface FieldRendererArgs {
  value: string | string[];
  disabled: boolean;
  placeholder: string;
  onChange: (next: string | string[]) => void;
  onBlur: () => void;
}

// kind별 어댑터 — 값 모양(string vs string[])을 각자 자기 자리에서 좁혀서,
// 이 파일 본문엔 kind 분기가 남지 않는다.
const FIELD_RENDERER: Record<
  DigestBodyFieldKind,
  (args: FieldRendererArgs) => React.ReactNode
> = {
  text: ({ value, ...rest }) => (
    <DigestTextField text={typeof value === "string" ? value : ""} {...rest} />
  ),
  list: ({ value, ...rest }) => (
    <DigestListField items={Array.isArray(value) ? value : [value]} {...rest} />
  ),
};

interface DigestBodyFieldProps {
  digestId: string;
  // 초안의 body 전체를 받는다 — 자기 필드만 읽지만, 타입이 바뀌어 이 필드가 사라진
  // 경우까지 같은 경로로 알아채야 화면이 초기화를 따라간다.
  body: ReviewDigest["body"];
  fieldKey: DigestBodyFieldKey;
  kind: DigestBodyFieldKind;
  labelKey: TranslationKey;
  placeholderKey: TranslationKey;
  disabled: boolean;
  // 값이 빈 필드는 카드에 포커스가 없을 때 높이 0으로 접는다. DOM에서 빼지는
  // 않는다 — 방향키로 도달하는 순간 카드가 펼쳐지며 커서가 들어가야 해서다.
  cardFocused: boolean;
}

export function DigestBodyField({
  digestId,
  body,
  fieldKey,
  kind,
  labelKey,
  placeholderKey,
  disabled,
  cardFocused,
}: DigestBodyFieldProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();
  const stored = readDigestBodyFieldValue(body, fieldKey);
  const field = useDraftField(
    resolveCommittedValue(stored, kind),
    (next) =>
      dispatch({
        type: "digest/setBodyField",
        id: digestId,
        key: fieldKey,
        value: next,
      }),
    isSameFieldValue,
  );

  const blank = isDigestBodyFieldBlank(field.value);
  const placeholder = t(placeholderKey);

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-normal ease-out",
        !blank || cardFocused
          ? "grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className="overflow-hidden">
        <div className="flex flex-col gap-1">
          <Text as="span" size="sm" weight="medium" color="tertiary">
            {t(labelKey)}
          </Text>
          {FIELD_RENDERER[kind]({
            value: field.value,
            disabled,
            placeholder,
            onChange: field.setValue,
            onBlur: field.commitNow,
          })}
        </div>
      </div>
    </div>
  );
}

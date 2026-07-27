import { cn, Text } from "@nema-io/weave";

import type {
  DigestBodyFieldKey,
  DigestBodyFieldKind,
} from "@web/features/review/constants";
import { useDraftField } from "@web/features/review/hooks/useDraftField";
import type { ReviewDigest } from "@web/features/review/types";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DigestListField } from "./DigestListField";
import { DigestTextField } from "./DigestTextField";
import { useReviewDraftContext } from "./ReviewDraftProvider";

// DIGEST_BODY_FIELDS의 key는 body.type과의 상관관계가 렌더 시점에 끊겨 string으로
// 넓어진다 — 단언 대신 실제 값 모양을 확인해 좁힌다.
function readFieldValue(
  body: ReviewDigest["body"],
  key: DigestBodyFieldKey,
): string | string[] | undefined {
  const raw: unknown = Object.getOwnPropertyDescriptor(body, key)?.value;
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw) && raw.every((item) => typeof item === "string")) {
    return raw;
  }
  return undefined;
}

// 리스트 필드는 한 번 타이핑했다 다 지우면 [""](빈 항목 1개)로 남는다 — length만
// 보면 이 상태를 "값 있음"으로 오판해 카드에서 포커스가 빠져도 계속 펼쳐진다.
function isBlank(value: string | string[]): boolean {
  if (typeof value === "string") {
    return value.trim() === "";
  }
  return value.every((item) => item.trim() === "");
}

// 빈 string[] 필드는 []로는 타이핑을 시작할 줄 자체가 없어 [""] 하나를 깔아준다.
// 실제로 치기 전까진 초안에 넘기지 않아 서버로 나가는 값은 그대로 비어 있다.
const EMPTY_VALUE: Record<DigestBodyFieldKind, string | string[]> = {
  text: "",
  list: [""],
};

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
  const stored = readFieldValue(body, fieldKey);
  const field = useDraftField(
    stored === undefined || isBlank(stored) ? EMPTY_VALUE[kind] : stored,
    (next) =>
      dispatch({
        type: "digest/setBodyField",
        id: digestId,
        key: fieldKey,
        value: next,
      }),
    isSameFieldValue,
  );

  const blank = isBlank(field.value);
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

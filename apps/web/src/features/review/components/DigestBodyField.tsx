import { cn, Text } from "@nema-io/weave";

import type {
  DigestBodyFieldKey,
  DigestBodyFieldKind,
} from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";
import { type TranslationKey, useTranslation } from "@web/lib/tolgee";

import { DigestListField } from "./DigestListField";
import { DigestTextField } from "./DigestTextField";
import { useEditing } from "./EditingProvider";

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
// 실제로 치기 전까진 dispatch되지 않아 서버로 나가는 값은 그대로 비어 있다.
const EMPTY_VALUE: Record<DigestBodyFieldKind, string | string[]> = {
  text: "",
  list: [""],
};

interface FieldRendererArgs {
  value: string | string[];
  disabled: boolean;
  placeholder: string;
  onChange: (next: string | string[]) => void;
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
  digestIndex: number;
  // 오버라이드가 아직 없을 때의 바탕 — 쿼리 결과라 참조가 안정적이어서, 이 prop이
  // 바뀌지 않는 한 형제 필드를 고쳐도 이 필드는 다시 그려지지 않는다.
  baseBody: ReviewDigest["body"];
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
  digestIndex,
  baseBody,
  fieldKey,
  kind,
  labelKey,
  placeholderKey,
  disabled,
  cardFocused,
}: DigestBodyFieldProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const stored = useEditing((state) =>
    readFieldValue(
      state.overrides.bodyOverrides.get(digestIndex) ?? baseBody,
      fieldKey,
    ),
  );

  const fieldValue: string | string[] =
    stored === undefined || isBlank(stored) ? EMPTY_VALUE[kind] : stored;
  const blank = isBlank(fieldValue);
  const placeholder = t(placeholderKey);

  function setFieldValue(next: string | string[]) {
    dispatch({
      type: "digest/setBodyField",
      index: digestIndex,
      baseBody,
      key: fieldKey,
      value: next,
    });
  }

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
            value: fieldValue,
            disabled,
            placeholder,
            onChange: setFieldValue,
          })}
        </div>
      </div>
    </div>
  );
}

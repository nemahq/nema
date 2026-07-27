import type { DigestBody } from "@nema-io/shared";
import { cn, Text } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import {
  DIGEST_BODY_FIELDS,
  type DigestBodyFieldKey,
} from "@web/features/review/constants";
import {
  isDigestBodyFieldBlank,
  readDigestBodyFieldValue,
} from "@web/features/review/digestBodyFieldValue";
import { useTranslation } from "@web/lib/tolgee";

interface DigestReadonlyBodyFieldsProps {
  body: DigestBody;
  // 진술이 어느 필드에서 나왔는지 표시하는 자리 — 이 슬라이스는 값을 안 채운다
  // (진술의 Digest 내 출처 위치 기록이 별도 슬라이스라서다). 값이 오면 그 필드에
  // 강조만 얹으면 되도록 지금부터 받아둔다.
  highlightedField?: DigestBodyFieldKey;
}

// 편집 카드(DigestBodyFields)와 달리 빈 필드는 아예 그리지 않는다 — 여기는 채워
// 넣을 사람이 없는 얼려진 기록이라, "채울 수 있다"는 빈 자리 신호가 필요 없다.
export function DigestReadonlyBodyFields({
  body,
  highlightedField,
}: DigestReadonlyBodyFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-2 flex flex-col gap-3 pl-2">
      {DIGEST_BODY_FIELDS[body.type].map((field) => {
        const fieldValue = readDigestBodyFieldValue(body, field.key);
        if (fieldValue === undefined || isDigestBodyFieldBlank(fieldValue)) {
          return null;
        }

        return (
          <div
            key={field.key}
            className={cn(
              "flex flex-col gap-1",
              highlightedField === field.key &&
                "-mx-2 rounded-sm bg-status-warning-tint px-2 py-1",
            )}
          >
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t(field.labelKey)}
            </Text>
            {field.kind === "text" ? (
              <Text as="p" size="base">
                {fieldValue as string}
              </Text>
            ) : (
              <ul className="flex flex-col gap-1">
                {(fieldValue as string[]).map((item, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
                    <Text as="span" size="base" className="flex-1">
                      {item}
                    </Text>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

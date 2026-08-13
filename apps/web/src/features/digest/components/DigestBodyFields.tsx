import type { Digest } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import {
  DIGEST_BODY_FIELDS,
  readDigestBodyField,
} from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestBodyFieldsProps {
  digest: Digest;
}

// 원문에 없어 못 채운 칸은 아예 그리지 않는다 — 채워 넣을 사람이 없는 기록이라
// 빈 자리를 남겨둘 이유가 없다(엔진이 값을 지어내지 않고 칸을 통째로 뺀다).
export function DigestBodyFields({ digest }: DigestBodyFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {DIGEST_BODY_FIELDS[digest.type].map((field) => {
        const fieldValue = readDigestBodyField(digest.body, field.key);
        if (fieldValue === undefined) {
          return null;
        }

        return (
          <div key={field.key} className="flex flex-col gap-1">
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t(field.labelKey)}
            </Text>
            {field.kind === "text" ? (
              <Text
                as="p"
                size="sm"
                color="primary"
                className="whitespace-pre-wrap"
              >
                {typeof fieldValue === "string"
                  ? fieldValue
                  : fieldValue.join("\n")}
              </Text>
            ) : (
              <ul className="flex flex-col gap-1">
                {(Array.isArray(fieldValue) ? fieldValue : [fieldValue]).map(
                  (entry, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Circle className="mt-2 size-1 shrink-0 fill-current text-fg-tertiary" />
                      <Text
                        as="span"
                        size="sm"
                        color="primary"
                        className="flex-1"
                      >
                        {entry}
                      </Text>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

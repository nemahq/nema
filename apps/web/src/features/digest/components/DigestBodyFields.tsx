import type { Digest } from "@nema-io/shared";
import { Text } from "@nema-io/weave";

import {
  DIGEST_BODY_FIELDS,
  readDigestBodyList,
  readDigestBodyOptions,
  readDigestBodyText,
} from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

import { DigestFieldBullet } from "./DigestFieldBullet";

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
        const text =
          field.kind === "text"
            ? readDigestBodyText(digest.body, field.key)
            : undefined;
        const list =
          field.kind === "list"
            ? readDigestBodyList(digest.body, field.key)
            : undefined;
        const options =
          field.kind === "option-list"
            ? readDigestBodyOptions(digest.body, field.key)
            : undefined;

        if (text === undefined && list === undefined && options === undefined) {
          return null;
        }

        return (
          <div key={field.key} className="flex flex-col gap-1">
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t(field.labelKey)}
            </Text>

            {text !== undefined && (
              <Text
                as="p"
                size="sm"
                color="primary"
                className="whitespace-pre-wrap"
              >
                {text}
              </Text>
            )}

            {list !== undefined && (
              <ul className="flex flex-col gap-1">
                {list.map((entry, index) => (
                  <DigestFieldBullet key={index}>
                    <Text as="span" size="sm" color="primary">
                      {entry}
                    </Text>
                  </DigestFieldBullet>
                ))}
              </ul>
            )}

            {/* 선택지를 먼저 읽고 이유가 딸려 읽히게 둔다 — 상세를 여는 사람이
                먼저 궁금한 건 "어떤 갈림길이 있었나"고 "왜 그랬나"는 그다음이다.
                한 줄에 붙이면 줄바꿈되는 순간 어디까지가 선택지인지 사라진다. */}
            {options !== undefined && (
              <ul className="flex flex-col gap-2">
                {options.map((entry, index) => (
                  <DigestFieldBullet key={index}>
                    <Text as="span" size="sm" color="primary">
                      {entry.option}
                    </Text>
                    {entry.detail !== undefined && (
                      <Text as="span" size="sm" color="tertiary">
                        {entry.detail}
                      </Text>
                    )}
                  </DigestFieldBullet>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

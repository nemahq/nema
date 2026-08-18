import type { Digest } from "@nema-io/shared";
import { Text } from "@nema-io/weave";
import { Circle } from "@nema-io/weave/icons";

import {
  DIGEST_BODY_FIELDS,
  readDigestBodyList,
  readDigestBodyOptions,
  readDigestBodyText,
} from "@web/features/digest/constants";
import { useTranslation } from "@web/lib/tolgee";

import { DetailConnectorIcon } from "./DetailConnectorIcon";
import { DigestFieldBullet } from "./DigestFieldBullet";

interface DigestReadonlyBodyFieldsProps {
  digest: Digest;
}

// legacy 포팅(legacy/apps/web/src/features/review/components/DigestReadonlyBodyFields.tsx) —
// text·list 칸은 legacy 모양(size="base", 인라인 Circle 불릿)을 그대로 가져온다.
// option-list(선택지·대안)는 legacy에 없던 필드 모양이라(#594에서 객체 배열로
// 바뀜) 가져올 원본이 없어 지금 모양(DigestFieldBullet, 선택지 위·이유 아래
// 흐린 줄)을 유지한다. 원문에 없어 못 채운 칸은 그리지 않는다 — 채울 사람이
// 없는 기록이라 빈 자리를 남겨둘 이유가 없다.
export function DigestReadonlyBodyFields({
  digest,
}: DigestReadonlyBodyFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-2 flex flex-col gap-3 pl-2">
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

        // alternatives는 이미 진 길이다(pending.branches와 달리 방향이 정해져
        // 있다) — "기각"이라는 낯선 단어 라벨 대신, 누구나 아는 취소선 관습으로
        // "끝난 선택지"임을 구조만으로 알게 한다. branches는 아직 안 갈린
        // 길이라 그대로 둔다.
        const isRejectedAlternative = field.key === "alternatives";

        return (
          <div key={field.key} className="flex flex-col gap-1">
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t(field.labelKey)}
            </Text>

            {/* legacy 카드는 whitespace-pre-wrap이 없지만, 텍스트 칸에 개행이
                섞여 있으면(예: 여러 문장을 줄바꿈으로 구분) 뭉개지지 않게
                여기선 유지한다 — 한 줄짜리 값엔 영향이 없다. */}
            {text !== undefined && (
              <Text as="p" size="base" className="whitespace-pre-wrap">
                {text}
              </Text>
            )}

            {list !== undefined && (
              <ul className="flex flex-col gap-1 pl-2">
                {list.map((entry, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
                    <Text as="span" size="base" className="flex-1">
                      {entry}
                    </Text>
                  </li>
                ))}
              </ul>
            )}

            {/* 선택지를 먼저 읽고 이유가 딸려 읽히게 둔다 — 상세를 여는 사람이
                먼저 궁금한 건 "어떤 갈림길이 있었나"고 "왜 그랬나"는 그다음이다. */}
            {options !== undefined && (
              <ul className="flex flex-col gap-2">
                {options.map((entry, index) => (
                  <DigestFieldBullet key={index}>
                    <Text
                      as="span"
                      size="base"
                      color="primary"
                      className={
                        isRejectedAlternative ? "line-through" : undefined
                      }
                    >
                      {entry.option}
                    </Text>
                    {entry.detail !== undefined && (
                      <div className="flex items-start gap-1">
                        <DetailConnectorIcon className="mt-0.5 size-3 shrink-0 text-fg-tertiary" />
                        <Text as="span" size="sm" color="tertiary">
                          {entry.detail}
                        </Text>
                      </div>
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

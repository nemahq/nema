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

function countListEntries(fieldValue: string | string[]): number {
  return Array.isArray(fieldValue) ? fieldValue.length : 1;
}

interface DigestReadonlyBodyFieldsProps {
  body: DigestBody;
  highlightedFieldKey?: DigestBodyFieldKey;
  highlightedFieldIndex?: number;
}

// 편집 카드(DigestBodyFields)와 달리 빈 필드는 아예 그리지 않는다 — 여기는 채워
// 넣을 사람이 없는 얼려진 기록이라, "채울 수 있다"는 빈 자리 신호가 필요 없다.
export function DigestReadonlyBodyFields({
  body,
  highlightedFieldKey,
  highlightedFieldIndex,
}: DigestReadonlyBodyFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-2 flex flex-col gap-3 pl-2">
      {DIGEST_BODY_FIELDS[body.type].map((field) => {
        const fieldValue = readDigestBodyFieldValue(body, field.key);
        if (fieldValue === undefined || isDigestBodyFieldBlank(fieldValue)) {
          return null;
        }

        const isFieldHighlighted = highlightedFieldKey === field.key;
        const listEntryCount =
          field.kind === "list" ? countListEntries(fieldValue) : 0;
        // index가 text 필드를 가리키거나 list 길이를 벗어나면(source_field_index는
        // DB CHECK 제약 없는 LLM 자유 출력이라 항상 맞는다는 보장이 없다) 항목
        // 강조를 포기하고 필드 전체 강조로 물러난다 — 강조가 조용히 통째로
        // 사라지는 것보다 낫다.
        const indexHighlightsListItem =
          isFieldHighlighted &&
          field.kind === "list" &&
          highlightedFieldIndex !== undefined &&
          highlightedFieldIndex >= 0 &&
          highlightedFieldIndex < listEntryCount;
        const highlightWholeField =
          isFieldHighlighted && !indexHighlightsListItem;

        return (
          <div
            key={field.key}
            className={cn(
              "flex flex-col gap-1",
              highlightWholeField &&
                "-mx-2 rounded-sm bg-status-warning-tint px-2 py-1",
            )}
          >
            <Text as="span" size="sm" weight="medium" color="tertiary">
              {t(field.labelKey)}
            </Text>
            {field.kind === "text" ? (
              <Text as="p" size="base">
                {typeof fieldValue === "string" ? fieldValue : ""}
              </Text>
            ) : (
              <ul className="flex flex-col gap-1">
                {(Array.isArray(fieldValue) ? fieldValue : [fieldValue]).map(
                  (listEntry, entryIndex) => (
                    <li
                      key={entryIndex}
                      className={cn(
                        "flex items-start gap-2",
                        indexHighlightsListItem &&
                          highlightedFieldIndex === entryIndex &&
                          "-mx-2 rounded-sm bg-status-warning-tint px-2 py-1",
                      )}
                    >
                      <Circle className="mt-2.5 size-1.5 shrink-0 fill-current text-fg-primary" />
                      <Text as="span" size="base" className="flex-1">
                        {listEntry}
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

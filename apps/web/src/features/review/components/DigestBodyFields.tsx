import { Text } from "@nema-io/weave";

import { DIGEST_BODY_FIELDS } from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";

interface BodyFieldRow {
  label: string;
  value: string;
}

// 원문에 없던 필드는 빈 채로 오므로 걸러낸다(review-flow.md "원문에 없는 필드는 비워둠").
function bodyFieldRows(body: ReviewDigest["body"]): BodyFieldRow[] {
  // key는 constants.ts에서 타입별로 좁혀져 있지만 여기서 body.type과의 상관관계가
  // 끊겨 string으로 넓어지고, 그래서 body를 직접 인덱싱하면 단언이 필요해진다.
  // 펼쳐두면 단언 없이 같은 값을 얻는다 — 컴파일 안전은 상수 정의부에서만 온다.
  const fieldValues: Record<string, unknown> = { ...body };

  return DIGEST_BODY_FIELDS[body.type]
    .map(({ key, label }) => {
      const fieldValue = fieldValues[key];
      if (
        fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === ""
      ) {
        return null;
      }
      return {
        label,
        value: Array.isArray(fieldValue)
          ? fieldValue.join(" · ")
          : String(fieldValue),
      };
    })
    .filter((row): row is BodyFieldRow => row !== null);
}

interface DigestBodyFieldsProps {
  body: ReviewDigest["body"];
}

export function DigestBodyFields({ body }: DigestBodyFieldsProps) {
  const rows = bodyFieldRows(body);
  if (rows.length === 0) {
    return null;
  }

  return (
    <dl className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.label}>
          <Text as="dt" size="xs" bold color="tertiary" className="uppercase">
            {row.label}
          </Text>
          <Text as="dd" className="mt-0.5">
            {row.value}
          </Text>
        </div>
      ))}
    </dl>
  );
}

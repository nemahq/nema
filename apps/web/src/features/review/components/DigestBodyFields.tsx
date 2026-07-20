import { DIGEST_BODY_FIELDS } from "@web/features/review/constants";
import type { ReviewDigest } from "@web/features/review/types";

interface BodyFieldRow {
  label: string;
  value: string;
}

// 원문에 없던 필드는 빈 채로 오므로 걸러낸다(review-flow.md "원문에 없는 필드는 비워둠").
function bodyFieldRows(body: ReviewDigest["body"]): BodyFieldRow[] {
  // 필드 목록과 body는 같은 판별자에서 나오지만 TypeScript가 둘의 상관관계를 추론하지
  // 못해, 직접 인덱싱하면 단언이 필요해진다. 펼쳐두면 단언 없이 같은 값을 얻는다.
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
    <dl className="flex flex-col gap-1.5 rounded-md bg-surface-card p-3 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex gap-2">
          <dt className="w-20 shrink-0 text-fg-tertiary">{row.label}</dt>
          <dd className="min-w-0 flex-1 text-fg-primary">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

import { useId, useState } from "react";

import { TAG_DESCRIPTION_MAX_LENGTH } from "@nema-io/shared";
import { Badge, Button, Text, Textarea } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface TagCreateFormProps {
  title: string;
  duplicateTitle: boolean;
  onBack: () => void;
  onSubmit: (description: string) => void;
}

// 이름은 검색행에서 이미 확정한 값이라 다시 편집하게 두지 않고 정적 Badge로만
// 보여준다(같은 값을 두 번 결정하게 만들지 않기 위해) — 그래서 이 폼이 실제로
// 받는 입력은 설명 하나뿐이라 거기로 바로 포커스가 간다. 설명 값을 패널이 아니라
// 이 폼이 들고 있는 이유도 같다 — 한 글자마다 칩 목록·검색 리스트까지 다시 그릴
// 이유가 없다.
export function TagCreateForm({
  title,
  duplicateTitle,
  onBack,
  onSubmit,
}: TagCreateFormProps) {
  const { t } = useTranslation();
  const descriptionFieldId = useId();
  const [description, setDescription] = useState("");
  const descriptionInvalid = description.trim() === "";
  const submittable =
    title.trim() !== "" && !descriptionInvalid && !duplicateTitle;
  const descriptionError = descriptionInvalid
    ? t("review.tag_create_description_required")
    : null;

  return (
    <div className="flex flex-col gap-3 px-2 pt-2 pb-2">
      <div className="flex flex-col gap-1.5">
        <Text size="sm" weight="medium" color="primary">
          {t("review.tag_create_title_label")}
        </Text>
        <Badge
          variant="outline"
          shape="rounded"
          truncated
          className="self-start"
        >
          {title}
        </Badge>
      </div>
      <div className="flex flex-col gap-1.5">
        <Text
          as="label"
          htmlFor={descriptionFieldId}
          size="sm"
          weight="medium"
          color="primary"
        >
          {t("review.tag_create_description_label")}
        </Text>
        {/* label을 감싸지 않고 htmlFor로 분리하는 이유 — 값을 색 있는 label 안에
            감싸 넣으면 타이핑한 텍스트가 label의 tertiary 색을 물려받아 흐려진다. */}
        <Textarea
          id={descriptionFieldId}
          autoFocus
          value={description}
          maxLength={TAG_DESCRIPTION_MAX_LENGTH}
          aria-invalid={descriptionInvalid}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <p
          role="alert"
          className={`text-xs ${descriptionError ? "text-status-error" : "text-transparent"}`}
        >
          {descriptionError ?? " "}
        </p>
      </div>
      <div className="flex justify-end gap-2">
        {/* 취소(common.cancel)가 아니라 뒤로(common.back) — 팝오버를 닫는 게
            아니라 검색 화면으로만 돌아간다. */}
        <Button type="button" variant="ghost" size="xs" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button
          type="button"
          size="xs"
          disabled={!submittable}
          onClick={() => onSubmit(description.trim())}
        >
          {t("common.create")}
        </Button>
      </div>
    </div>
  );
}

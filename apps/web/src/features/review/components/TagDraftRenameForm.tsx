import { useState } from "react";

import {
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
  type TagColor,
} from "@nema-io/shared";
import { Button, Input, TagColorListPicker, Textarea } from "@nema-io/weave";

import { TAG_COLOR_LABEL_KEY } from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface TagDraftRenameFormProps {
  title: string;
  description: string;
  color: TagColor;
  // TopicDraftRenameForm과 같은 이유로 배열 대신 콜백 — 입력값이 바뀔 때마다
  // 이 폼 안에서 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수 없다.
  isDuplicateTitle: (title: string) => boolean;
  onSubmit: (title: string, description: string, color: TagColor) => void;
}

// TopicDraftRenameForm과 같은 스코프(신규 Tag 자신만) — Tag는 description도
// 재사용 판단 기준(07-modeling.md)이라 이름과 같이 고칠 수 있어야 한다.
export function TagDraftRenameForm({
  title,
  description,
  color,
  isDuplicateTitle,
  onSubmit,
}: TagDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const [colorValue, setColorValue] = useState(color);
  const trimmedTitle = titleValue.trim();
  const trimmedDescription = descriptionValue.trim();
  const duplicateTitle = isDuplicateTitle(trimmedTitle);
  const titleInvalid = trimmedTitle === "" || duplicateTitle;
  const descriptionInvalid = trimmedDescription === "";
  const submittable = !titleInvalid && !descriptionInvalid;

  function getTitleError() {
    if (trimmedTitle === "") {
      return t("common.name_required");
    }
    if (duplicateTitle) {
      return t("common.name_taken");
    }
    return null;
  }
  const titleError = getTitleError();
  const descriptionError = descriptionInvalid
    ? t("common.description_required")
    : null;

  function submit() {
    if (submittable) {
      onSubmit(trimmedTitle, trimmedDescription, colorValue);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          value={titleValue}
          maxLength={TAG_TITLE_MAX_LENGTH}
          aria-label={t("common.name_label")}
          aria-invalid={titleInvalid}
          onChange={(e) => setTitleValue(e.target.value)}
        />
        <p
          role="alert"
          className={`text-xs ${titleError ? "text-status-error" : "text-transparent"}`}
        >
          {titleError ?? " "}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Textarea
          value={descriptionValue}
          maxLength={TAG_DESCRIPTION_MAX_LENGTH}
          aria-label={t("review.tag_create_description_label")}
          aria-invalid={descriptionInvalid}
          onChange={(e) => setDescriptionValue(e.target.value)}
          rows={3}
        />
        <p
          role="alert"
          className={`text-xs ${descriptionError ? "text-status-error" : "text-transparent"}`}
        >
          {descriptionError ?? " "}
        </p>
      </div>
      <div role="group" aria-label={t("review.tag_color_label")}>
        <TagColorListPicker
          value={colorValue}
          onChange={setColorValue}
          getColorLabel={(c) => t(TAG_COLOR_LABEL_KEY[c])}
        />
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="xs"
          disabled={!submittable}
          onClick={submit}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";

import { TAG_DESCRIPTION_MAX_LENGTH, type TagColor } from "@nema-io/shared";
import {
  Badge,
  Button,
  cn,
  Input,
  TAG_COLOR_CLASSNAME,
  TagColorGridPicker,
  Text,
} from "@nema-io/weave";

import { TAG_COLOR_LABEL_KEY } from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface TagCreateFormProps {
  title: string;
  // 검색 목록의 "만들기" 미리보기 Badge가 이미 보여준 랜덤 색 — 이 폼이 새로
  // 또 뽑지 않고 그 값을 이어받아, 미리보기와 실제 생성 폼에서 같은 색이 보인다
  // (TagEditPanel.tsx의 previewColor 주석 참고).
  initialColor: TagColor;
  duplicateTitle: boolean;
  onBack: () => void;
  onSubmit: (description: string, color: TagColor) => void;
}

// 이름은 검색행에서 이미 확정한 값이라 다시 편집하게 두지 않고 정적 Badge로만
// 보여준다(같은 값을 두 번 결정하게 만들지 않기 위해) — 그래서 이 폼이 실제로
// 받는 입력은 설명 하나뿐이라 거기로 바로 포커스가 간다. 설명 값을 패널이 아니라
// 이 폼이 들고 있는 이유도 같다 — 한 글자마다 칩 목록·검색 리스트까지 다시 그릴
// 이유가 없다.
export function TagCreateForm({
  title,
  initialColor,
  duplicateTitle,
  onBack,
  onSubmit,
}: TagCreateFormProps) {
  const { t } = useTranslation();
  const [description, setDescription] = useState("");
  // 건드리기 전까지는 에러를 안 띄운다 — 안 그러면 열자마자(아직 아무것도
  // 안 쳤는데) 빈 값 에러가 뜬다(SpaceNameField.tsx의 touched 패턴과 동일).
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  // 초깃값만 미리보기에서 이어받고, 이후엔 그리드에서 고른 값을 그대로 들고
  // 간다(엔진·랜덤이 채운 값은 초깃값일 뿐, 최종 결정은 항상 사용자 몫이라는
  // 07-modeling.md 원칙).
  const [color, setColor] = useState<TagColor>(initialColor);
  const descriptionInvalid = description.trim() === "";
  const submittable =
    title.trim() !== "" && !descriptionInvalid && !duplicateTitle;
  const descriptionError =
    descriptionTouched && descriptionInvalid
      ? t("common.description_required")
      : null;

  return (
    <div className="flex flex-col gap-4 px-2 pt-2 pb-2">
      {/* 이름·설명을 "뭘 만드는지" 한 그룹으로 좁게 묶고(gap-2), 색상 그리드는
          "어떻게 보일지"라는 별개 관심사라 바깥 gap-4로 한 단 떼어 놓는다. */}
      <div className="flex flex-col gap-2">
        <Badge
          shape="rounded"
          truncated
          className={cn("self-start", TAG_COLOR_CLASSNAME[color])}
        >
          {title}
        </Badge>
        <div className="flex flex-col gap-1.5">
          {/* 라벨을 안 보이게 하는 대신, 입력 자체엔 aria-label로 접근성 이름을
              유지한다(common.name_label 자리의 정적 Badge는 그 자체가 값을
              보여줘 라벨이 굳이 필요 없지만, 이 Input은 실제 폼 컨트롤이라
              시각 라벨이 없어도 스크린리더용 이름은 있어야 한다). */}
          <Input
            autoFocus
            value={description}
            maxLength={TAG_DESCRIPTION_MAX_LENGTH}
            placeholder={t("common.description_placeholder")}
            aria-label={t("review.tag_create_description_label")}
            aria-invalid={descriptionTouched && descriptionInvalid}
            onChange={(e) => {
              setDescription(e.target.value);
              setDescriptionTouched(true);
            }}
          />
          <p
            role="alert"
            className={`text-xs ${descriptionError ? "text-status-error" : "text-transparent"}`}
          >
            {descriptionError ?? " "}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Text size="sm" color="tertiary">
          {t("review.tag_color_label")}
        </Text>
        <TagColorGridPicker
          value={color}
          onChange={setColor}
          getColorLabel={(c) => t(TAG_COLOR_LABEL_KEY[c])}
        />
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
          onClick={() => onSubmit(description.trim(), color)}
        >
          {t("common.create")}
        </Button>
      </div>
    </div>
  );
}

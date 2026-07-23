import { useState } from "react";

import { DIGEST_TYPES, type DigestType } from "@nema-io/shared";
import {
  Button,
  Chip,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Check } from "@nema-io/weave/icons";

import { Dialog } from "@web/components/ui/Dialog";
import {
  DIGEST_TYPE_LABEL_KEY,
  DIGEST_TYPE_TAG_COLOR,
} from "@web/features/review/constants";
import { useTranslation } from "@web/lib/tolgee";

interface DigestTypePickerProps {
  type: DigestType;
  disabled: boolean;
  onChangeType: (next: DigestType) => void;
}

// 타입은 이제 상시 노출(design-decisions-log.md — 펼친 본문이 타입을 드러내도
// 스캔 속도는 배지 쪽이 더 빠름) + 클릭 시 바로 변경(Chip, DraftSpaceSelect와
// 같은 드롭다운 패턴). 다만 타입 변경은 본문 필드를 초기화하는 유일한 조작이라
// (review-flow.md "타입 변경 시 필드 초기화"), 숨겨서 막던 안전장치를 확인
// 한 단계로 옮긴다 — Reference 타입 변경엔 이 위험이 없어 확인이 없다.
export function DigestTypePicker({
  type,
  disabled,
  onChangeType,
}: DigestTypePickerProps) {
  const { t } = useTranslation();
  const [pendingType, setPendingType] = useState<DigestType | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Chip
            color={DIGEST_TYPE_TAG_COLOR[type]}
            disabled={disabled}
            aria-label={t("review.digest_type_change_action")}
          >
            {t(DIGEST_TYPE_LABEL_KEY[type])}
          </Chip>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" width={160}>
          {DIGEST_TYPES.map((candidate) => (
            <DropdownMenuItem
              key={candidate}
              className="pr-8"
              onClick={() => {
                if (candidate !== type) {
                  setPendingType(candidate);
                }
              }}
            >
              {t(DIGEST_TYPE_LABEL_KEY[candidate])}
              {candidate === type && (
                <span className="absolute right-2 flex size-3.5 items-center justify-center">
                  <Check className="size-4" />
                </span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={pendingType !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingType(null);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {t("review.digest_type_change_confirm_title")}
            </DialogTitle>
            <DialogDescription>
              {t("review.digest_type_change_confirm_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingType(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (pendingType) {
                  onChangeType(pendingType);
                }
                setPendingType(null);
              }}
            >
              {t("review.digest_type_change_confirm_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

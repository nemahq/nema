import { useState } from "react";

import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { Dialog } from "@web/components/ui/Dialog";
import { useTranslation } from "@web/lib/tolgee";

interface DeleteConfirmActionProps {
  confirmTitle: string;
  confirmDescription: string;
  isPending: boolean;
  isPendingAfterDelay: boolean;
  // 삭제에 필요한 값(내부 id)이 아직 없을 때 트리거 자체를 막는다 — 상세 헤더가
  // 조회(get) 응답을 기다리는 동안이 이 경우다(SourceDetailPanel 참고).
  disabled?: boolean;
  // 다이얼로그를 닫는 시점은 소비처가 쥔다 — 성공했을 때만 닫아야 하는데
  // 성공 여부는 mutation을 들고 있는 쪽만 안다.
  onConfirm: (closeDialog: () => void) => void;
}

// 휴지통 → 확인 다이얼로그. 원문·다이제스트가 같은 무게의 삭제를 같은 모양으로
// 보여준다 — 자리마다 무게가 달라 보이면 사용자가 헷갈린다.
export function DeleteConfirmAction({
  confirmTitle,
  confirmDescription,
  isPending,
  isPendingAfterDelay,
  disabled = false,
  onConfirm,
}: DeleteConfirmActionProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    onConfirm(() => setConfirmOpen(false));
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.delete")}
            onClick={() => setConfirmOpen(true)}
            disabled={disabled}
            className="size-7 text-fg-tertiary"
          >
            <Trash2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("common.delete")}</TooltipContent>
      </Tooltip>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirm}
              disabled={isPending}
            >
              {isPendingAfterDelay ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

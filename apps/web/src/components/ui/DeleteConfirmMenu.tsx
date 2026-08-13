import { useState } from "react";

import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { MoreHorizontal } from "@nema-io/weave/icons";

import { Dialog } from "@web/components/ui/Dialog";
import { DropdownMenu } from "@web/components/ui/DropdownMenu";
import { useTranslation } from "@web/lib/tolgee";

interface DeleteConfirmMenuProps {
  confirmTitle: string;
  confirmDescription: string;
  isPending: boolean;
  isPendingAfterDelay: boolean;
  // 다이얼로그를 닫는 시점은 소비처가 쥔다 — 성공했을 때만 닫아야 하는데
  // 성공 여부는 mutation을 들고 있는 쪽만 안다.
  onConfirm: (closeDialog: () => void) => void;
}

// 미트볼(⋯) → 드롭다운 → 확인 다이얼로그. 원문·다이제스트가 같은 무게의 삭제를
// 같은 모양으로 보여준다 — 자리마다 무게가 달라 보이면 사용자가 헷갈린다.
export function DeleteConfirmMenu({
  confirmTitle,
  confirmDescription,
  isPending,
  isPendingAfterDelay,
  onConfirm,
}: DeleteConfirmMenuProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    onConfirm(() => setConfirmOpen(false));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.more_actions")}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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

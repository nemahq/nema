import { useState } from "react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { NavigationBar } from "@web/components/layout/NavigationBar";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { usePendingSourceListSuspenseQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { waitingDraftIds } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteWaitingDraftsDialog } from "./DeleteWaitingDraftsDialog";

export function DraftsNavigationBar() {
  const { t } = useTranslation();
  const [pendingSources] = usePendingSourceListSuspenseQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sourceIds = waitingDraftIds(pendingSources.items);

  return (
    <>
      <NavigationBar
        items={[{ label: t("intake.drafts_title") }]}
        rightContent={
          sourceIds.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("intake.drafts_delete_waiting_action")}
                  onClick={() => setDialogOpen(true)}
                  className="size-7 text-fg-tertiary"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("intake.drafts_delete_waiting_action")}
              </TooltipContent>
            </Tooltip>
          )
        }
      />
      <DeleteWaitingDraftsDialog
        sourceIds={sourceIds}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}

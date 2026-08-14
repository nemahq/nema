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
import { useSourceDraftListSuspenseQuery } from "@web/features/drafts/hooks/useSourceDraftListQuery";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteWaitingDraftsDialog } from "./DeleteWaitingDraftsDialog";

export function DraftsNavigationBar() {
  const { t } = useTranslation();
  const [drafts] = useSourceDraftListSuspenseQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const sourceIds = drafts.map((draft) => draft.sourceId);

  return (
    <>
      <NavigationBar
        items={[{ label: t("workspace.drafts") }]}
        rightContent={
          sourceIds.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t("draft.delete_waiting_action")}
                  onClick={() => setDialogOpen(true)}
                  className="size-7 text-fg-tertiary"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("draft.delete_waiting_action")}
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

import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Ellipsis, Pencil, Trash2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

import { DeleteSessionDialog } from "./DeleteSessionDialog";

interface SessionItemMenuProps {
  sessionId: string;
  onStartEditing: () => void;
}

export function SessionItemMenu({
  sessionId,
  onStartEditing,
}: SessionItemMenuProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("session.menu")}
            className="absolute right-1 flex size-6 cursor-pointer items-center justify-center rounded-md opacity-0 transition-opacity duration-fast hover:bg-surface-raised-hover group-hover:opacity-100 data-[state=open]:bg-surface-raised-hover data-[state=open]:opacity-100"
            onClick={(e) => e.preventDefault()}
          >
            <Ellipsis className="size-4 text-fg-tertiary" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="start" sideOffset={4}>
          <DropdownMenuItem onClick={onStartEditing}>
            <Pencil />
            {t("session.rename")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="danger"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteSessionDialog
        sessionId={sessionId}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          if ("sessionId" in params && params.sessionId === sessionId) {
            navigate({ to: "/" });
          }
        }}
      />
    </>
  );
}

import { memo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { Ellipsis, Pencil, Trash2 } from "@nema-io/weave/icons";

import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { useTranslation } from "@web/lib/tolgee";

import { DeleteSessionDialog } from "./DeleteSessionDialog";
import { RenameInput } from "./RenameInput";

export const SessionItem = memo(function SessionItem({
  sessionId,
  title: rawTitle,
}: {
  sessionId: string;
  title: string | null;
}) {
  const { t } = useTranslation();
  const trackEvent = useTrackEvent();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const title = rawTitle ?? t("session.untitled");

  const [isEditing, setIsEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isEditing) {
    return (
      <RenameInput
        sessionId={sessionId}
        currentTitle={rawTitle}
        onEditEnd={() => setIsEditing(false)}
      />
    );
  }

  return (
    <>
      <div className="group relative flex items-center">
        <Link
          to="/session/$sessionId"
          params={{ sessionId }}
          onClick={() => trackEvent("session.navigate", sessionId)}
          className="w-full cursor-pointer truncate rounded-md px-2 py-1.5 pr-8 text-left text-sm transition-colors duration-fast"
          activeProps={{
            className: "bg-surface-raised-hover text-fg-primary font-medium",
          }}
          inactiveProps={{
            className: "text-fg-secondary hover:bg-surface-raised-hover",
          }}
        >
          {title}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="absolute right-1 flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity duration-fast hover:bg-surface-raised-hover group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.preventDefault()}
            >
              <Ellipsis className="size-4 text-fg-tertiary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" sideOffset={4}>
            <DropdownMenuItem onClick={() => setIsEditing(true)}>
              <Pencil />
              {t("session.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
              {t("session.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
});

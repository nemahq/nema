import { memo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

import type { SessionSummary } from "@nema-io/shared";
import {
  Button,
  Dialog,
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
import { Ellipsis, Pencil, Trash2 } from "@nema-io/weave/icons";

import { useDeleteSession } from "@web/features/session/hooks/useDeleteSession";
import { useUpdateSession } from "@web/features/session/hooks/useUpdateSession";
import { useTrackEvent } from "@web/hooks/useTrackEvent";
import { useTranslation } from "@web/lib/tolgee";

export const SessionItem = memo(function SessionItem({
  session,
}: {
  session: SessionSummary;
}) {
  const { t } = useTranslation();
  const trackEvent = useTrackEvent();
  const title = session.title ?? t("session.untitled");

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateMutation = useUpdateSession();
  const deleteMutation = useDeleteSession();

  function startEditing() {
    setEditValue(session.title ?? "");
    setIsEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function commitEdit() {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === session.title) {
      setIsEditing(false);
      return;
    }
    updateMutation.mutate(
      { sessionId: session.id, title: trimmed },
      { onSettled: () => setIsEditing(false) },
    );
  }

  function handleDelete() {
    deleteMutation.mutate({ sessionId: session.id });
    setDeleteOpen(false);
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitEdit();
          }
          if (e.key === "Escape") {
            setIsEditing(false);
          }
        }}
        className="w-full rounded-md bg-surface-raised px-2 py-1.5 text-sm text-fg-primary outline-none ring-1 ring-brand"
      />
    );
  }

  return (
    <>
      <div className="group relative flex items-center">
        <Link
          to="/session/$sessionId"
          params={{ sessionId: session.id }}
          onClick={() => trackEvent("session.navigate", session.id)}
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
            <DropdownMenuItem onClick={startEditing}>
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

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("session.delete_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("session.delete_confirm_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              {t("session.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});

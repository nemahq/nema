import { useState } from "react";

import type { TopicStatus } from "@nema-io/shared";
import { Button } from "@nema-io/weave";

import { ConfirmButton } from "@web/features/dev-harness/components/ConfirmButton";
import { useArchiveTopic } from "@web/features/dev-harness/hooks/useArchiveTopic";
import { useRestoreTopic } from "@web/features/dev-harness/hooks/useRestoreTopic";
import { useUpdateTopic } from "@web/features/dev-harness/hooks/useUpdateTopic";
import { getErrorMessage } from "@web/lib/getErrorMessage";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface-card px-2 py-1 text-sm text-fg-primary outline-none focus:border-border-strong";

interface TopicRowProps {
  id: string;
  name: string;
  status: TopicStatus;
}

export function TopicRow({ id, name, status }: TopicRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const updateTopic = useUpdateTopic();
  const archiveTopic = useArchiveTopic();
  const restoreTopic = useRestoreTopic();

  const pending =
    updateTopic.isPending || archiveTopic.isPending || restoreTopic.isPending;
  const error = updateTopic.error ?? archiveTopic.error ?? restoreTopic.error;

  function handleSaveRename() {
    updateTopic.mutate(
      { id, name: draftName },
      { onSuccess: () => setRenaming(false) },
    );
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/40 p-2">
      <div className="flex items-center gap-2">
        <span
          className={
            status === "archived"
              ? "text-[10px] uppercase text-fg-tertiary"
              : "text-[10px] uppercase text-status-success"
          }
        >
          {status}
        </span>

        {renaming ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className={INPUT_CLASS}
          />
        ) : (
          <span className="flex-1 text-sm text-fg-primary">{name}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {renaming ? (
          <>
            <Button
              size="xs"
              disabled={pending || draftName.trim() === ""}
              onClick={handleSaveRename}
            >
              저장
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setDraftName(name);
                setRenaming(false);
              }}
            >
              취소
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="ghost"
            disabled={pending || status === "archived"}
            onClick={() => setRenaming(true)}
          >
            이름변경
          </Button>
        )}

        {status === "active" ? (
          <ConfirmButton
            label="아카이브"
            disabled={pending}
            onConfirm={() => archiveTopic.mutate({ id })}
          />
        ) : (
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={() => restoreTopic.mutate({ id })}
          >
            되살리기
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-status-error">{getErrorMessage(error)}</p>
      )}
    </div>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SaveJob } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

const PANEL_DISMISS_MS = 3_000;

type SaveQueueItem = Omit<SaveJob, "id" | "updatedAt"> & {
  jobId: string;
};

function toSaveQueueItem(job: SaveJob): SaveQueueItem {
  return {
    jobId: job.id,
    sessionId: job.sessionId,
    status: job.status,
    snippet: job.snippet,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
  };
}

interface SaveQueueContextValue {
  items: SaveQueueItem[];
  addJob: (job: SaveJob) => void;
  retry: (jobId: string) => void;
}

const SaveQueueContext = createContext<SaveQueueContextValue | null>(null);

export function useSaveQueue(): SaveQueueContextValue {
  const ctx = useContext(SaveQueueContext);
  if (!ctx) {
    throw new Error("useSaveQueue must be used within SaveQueueProvider");
  }
  return ctx;
}

interface SaveQueueProviderProps {
  children: React.ReactNode;
}

export function SaveQueueProvider({ children }: SaveQueueProviderProps) {
  const [sseUpdates, setSseUpdates] = useState<Map<string, SaveQueueItem>>(
    new Map(),
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const panelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: initialJobs } = trpc.saveJob.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const clearPanelTimer = useCallback(() => {
    if (panelTimer.current) {
      clearTimeout(panelTimer.current);
      panelTimer.current = null;
    }
  }, []);

  const addJob = useCallback(
    (job: SaveJob) => {
      clearPanelTimer();
      setSseUpdates((prev) => {
        const next = new Map(prev);
        next.set(job.id, toSaveQueueItem(job));
        return next;
      });
    },
    [clearPanelTimer],
  );

  const retrySave = trpc.saveJob.retry.useMutation({
    onSuccess(job) {
      addJob(job);
    },
  });

  const retry = useCallback(
    (jobId: string) => {
      retrySave.mutate({ jobId });
    },
    [retrySave],
  );

  trpc.saveJob.onUpdate.useSubscription(undefined, {
    onData(event) {
      if (event.type !== "job_update") {
        return;
      }

      const { job } = event;

      setSseUpdates((prev) => {
        const next = new Map(prev);
        next.set(job.id, toSaveQueueItem(job));
        return next;
      });
    },
    onError() {},
  });

  const items = useMemo(() => {
    const merged = new Map<string, SaveQueueItem>();

    if (initialJobs) {
      for (const j of initialJobs) {
        merged.set(j.id, toSaveQueueItem(j));
      }
    }

    for (const [id, queueItem] of sseUpdates) {
      merged.set(id, queueItem);
    }

    return [...merged.values()].filter((i) => !dismissedIds.has(i.jobId));
  }, [initialJobs, sseUpdates, dismissedIds]);

  useEffect(
    function panelAutoDismiss() {
      if (items.length === 0) {
        clearPanelTimer();
        return;
      }

      const hasActive = items.some(
        (i) => i.status === "pending" || i.status === "processing",
      );
      const hasFailed = items.some((i) => i.status === "failed");

      if (hasActive || hasFailed) {
        clearPanelTimer();
        return;
      }

      // 전체 완료 — 패널 자동 dismiss 예약
      if (!panelTimer.current) {
        const ids = items.map((i) => i.jobId);
        panelTimer.current = setTimeout(() => {
          setDismissedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              next.add(id);
            }
            return next;
          });
          panelTimer.current = null;
        }, PANEL_DISMISS_MS);
      }
    },
    [items, clearPanelTimer],
  );

  useEffect(function cleanupPanelTimer() {
    return () => {
      if (panelTimer.current) {
        clearTimeout(panelTimer.current);
      }
    };
  }, []);

  return (
    <SaveQueueContext.Provider value={{ items, addJob, retry }}>
      {children}
    </SaveQueueContext.Provider>
  );
}

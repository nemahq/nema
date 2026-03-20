import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Sentry from "@sentry/react";

import type { SaveJob } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

const PANEL_DISMISS_MS = 3_000;

export type PanelStatus = "active" | "completed" | "failed";

function derivePanelStatus(items: { status: string }[]): PanelStatus {
  if (items.some((i) => i.status === "pending" || i.status === "processing")) {
    return "active";
  }
  if (items.some((i) => i.status === "failed")) {
    return "failed";
  }
  return "completed";
}

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
  const utils = trpc.useUtils();
  const [sseUpdates, setSseUpdates] = useState<Map<string, SaveQueueItem>>(
    new Map(),
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data: initialJobs } = trpc.saveJob.list.useQuery(undefined, {
    staleTime: Infinity,
  });

  const addJob = useCallback((job: SaveJob) => {
    setSseUpdates((prev) => {
      const next = new Map(prev);
      next.set(job.id, toSaveQueueItem(job));
      return next;
    });
  }, []);

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

      if (job.status === "completed") {
        void utils.message.list.invalidate({ sessionId: job.sessionId });
      }
    },
    onError(error) {
      Sentry.captureException(error, {
        tags: { component: "save-queue-sse" },
      });
    },
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
        return;
      }

      const status = derivePanelStatus(items);
      if (status !== "completed") {
        return;
      }

      const ids = items.map((i) => i.jobId);
      const timer = setTimeout(() => {
        setDismissedIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) {
            next.add(id);
          }
          return next;
        });
      }, PANEL_DISMISS_MS);

      return () => clearTimeout(timer);
    },
    [items],
  );

  const saveQueueValue = useMemo(
    () => ({ items, addJob, retry }),
    [items, addJob, retry],
  );

  return (
    <SaveQueueContext.Provider value={saveQueueValue}>
      {children}
    </SaveQueueContext.Provider>
  );
}

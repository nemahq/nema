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

const SAVE_SUCCESS_DISMISS_MS = 3_000;

type SaveQueueItem = Omit<SaveJob, "id" | "updatedAt"> & {
  jobId: string;
};

function toSaveQueueItem(job: SaveJob): SaveQueueItem {
  return {
    jobId: job.id,
    sessionId: job.sessionId,
    status: job.status,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
  };
}

interface SaveQueueContextValue {
  items: SaveQueueItem[];
  addJob: (job: SaveJob) => void;
  dismiss: (jobId: string) => void;
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
  const dismissTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const { data: initialJobs } = trpc.saveJob.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const dismiss = useCallback((jobId: string) => {
    setDismissedIds((prev) => new Set(prev).add(jobId));
    const timer = dismissTimers.current.get(jobId);
    if (timer) {
      clearTimeout(timer);
      dismissTimers.current.delete(jobId);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (jobId: string) => {
      if (dismissTimers.current.has(jobId)) {
        return;
      }
      const timer = setTimeout(() => {
        dismiss(jobId);
        dismissTimers.current.delete(jobId);
      }, SAVE_SUCCESS_DISMISS_MS);
      dismissTimers.current.set(jobId, timer);
    },
    [dismiss],
  );

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
      const queueItem = toSaveQueueItem(job);

      setSseUpdates((prev) => {
        const next = new Map(prev);
        next.set(job.id, queueItem);
        return next;
      });

      if (job.status === "completed") {
        scheduleDismiss(job.id);
      }
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

  useEffect(function cleanupDismissTimers() {
    const timers = dismissTimers.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
    };
  }, []);

  return (
    <SaveQueueContext.Provider value={{ items, addJob, dismiss, retry }}>
      {children}
    </SaveQueueContext.Provider>
  );
}

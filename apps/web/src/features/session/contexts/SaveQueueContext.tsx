import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { SaveJobStatus } from "@nema-io/shared";

import { trpc } from "@web/lib/trpc";

const SAVE_SUCCESS_DISMISS_MS = 3_000;

export interface SaveQueueItem {
  jobId: string;
  sessionId: string;
  status: SaveJobStatus;
  errorMessage: string | null;
  createdAt: string;
}

interface SaveQueueContextValue {
  items: SaveQueueItem[];
  dismiss: (jobId: string) => void;
}

const SaveQueueContext = createContext<SaveQueueContextValue | null>(null);

export function useSaveQueue(): SaveQueueContextValue {
  const ctx = useContext(SaveQueueContext);
  if (!ctx) {
    throw new Error("useSaveQueue must be used within SaveQueueProvider");
  }
  return ctx;
}

export function SaveQueueProvider({ children }: { children: React.ReactNode }) {
  // SSE로 수신한 업데이트만 관리. 초기 데이터는 query에서 직접 사용
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

  trpc.saveJob.onUpdate.useSubscription(undefined, {
    onData(event) {
      if (event.type !== "job_update") {
        return;
      }

      const { job } = event;
      const item: SaveQueueItem = {
        jobId: job.id,
        sessionId: job.sessionId,
        status: job.status,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt,
      };

      setSseUpdates((prev) => {
        const next = new Map(prev);
        next.set(job.id, item);
        return next;
      });

      if (job.status === "completed") {
        scheduleDismiss(job.id);
      }
    },
  });

  // query 결과와 SSE 업데이트를 합산. SSE가 우선 (더 최신)
  const items = useMemo(() => {
    const merged = new Map<string, SaveQueueItem>();

    if (initialJobs) {
      for (const j of initialJobs) {
        merged.set(j.id, {
          jobId: j.id,
          sessionId: j.sessionId,
          status: j.status,
          errorMessage: j.errorMessage,
          createdAt: j.createdAt,
        });
      }
    }

    for (const [id, item] of sseUpdates) {
      merged.set(id, item);
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
    <SaveQueueContext.Provider value={{ items, dismiss }}>
      {children}
    </SaveQueueContext.Provider>
  );
}

import { useSaveQueue } from "@web/features/session/contexts/SaveQueueContext";

import { SaveQueueEntry } from "./SaveQueueEntry";

export function SaveQueueWidget() {
  const { items, dismiss, retry } = useSaveQueue();

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-72 flex-col gap-2">
      {items.map((item) => (
        <SaveQueueEntry
          key={item.jobId}
          jobId={item.jobId}
          status={item.status}
          onDismiss={dismiss}
          onRetry={retry}
        />
      ))}
    </div>
  );
}

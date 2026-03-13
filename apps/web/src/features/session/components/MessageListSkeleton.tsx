import { Skeleton } from "@nema-io/weave";

const SKELETON_COUNT = 4;

export function MessageListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        {Array.from({ length: SKELETON_COUNT }, (_, i) => {
          const isUser = i % 2 === 0;
          return (
            <div
              key={i}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div className="flex max-w-[80%] flex-col gap-1.5">
                <Skeleton className={`h-4 ${isUser ? "w-48" : "w-64"}`} />
                {!isUser && <Skeleton className="h-4 w-40" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import { Skeleton } from "@nema-io/weave";

export function MessageListSkeleton() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-6">
        {/* user */}
        <div className="flex justify-end">
          <div className="h-9 w-36 rounded-2xl rounded-br-sm bg-surface-raised-hover" />
        </div>

        {/* assistant */}
        <div className="flex justify-start">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-64 rounded-sm" />
            <Skeleton className="h-4 w-48 rounded-sm" />
          </div>
        </div>

        {/* user */}
        <div className="flex justify-end">
          <div className="h-9 w-52 rounded-2xl rounded-br-sm bg-surface-raised-hover" />
        </div>

        {/* assistant */}
        <div className="flex justify-start">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-72 rounded-sm" />
            <Skeleton className="h-4 w-56 rounded-sm" />
            <Skeleton className="h-4 w-40 rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

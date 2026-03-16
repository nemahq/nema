import { Skeleton } from "@nema-io/weave";

export function MessageListSkeleton() {
  return (
    <div className="relative flex-1">
      <div className="absolute inset-0 overflow-hidden">
        <div className="mx-auto max-w-2xl space-y-4 px-6 pt-6">
          {/* user: editor-style box */}
          <Skeleton className="h-11 w-full rounded-xl" />

          {/* assistant: flat text lines */}
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-72 rounded-sm" />
            <Skeleton className="h-4 w-56 rounded-sm" />
          </div>
        </div>

        {/* composer */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-2">
          <div className="mx-auto max-w-2xl">
            <Skeleton className="h-[52px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

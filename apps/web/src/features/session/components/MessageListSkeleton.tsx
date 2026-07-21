import { Skeleton, TextSkeleton } from "@nema-io/weave";

export function MessageListSkeleton() {
  return (
    <div className="relative flex-1">
      <div className="absolute inset-0 overflow-hidden">
        <div className="mx-auto max-w-2xl space-y-4 px-6 pt-6">
          <Skeleton className="h-11 w-full rounded-xl" />

          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-72 rounded-sm" />
            <Skeleton className="h-4 w-56 rounded-sm" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 pt-2">
          <div className="mx-auto max-w-2xl">
            {/* ChatComposer의 모드 힌트 줄(px-2 pb-1) 자리 */}
            <TextSkeleton size="xs" className="w-32 px-2 pb-1" />
            <Skeleton className="h-[94px] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

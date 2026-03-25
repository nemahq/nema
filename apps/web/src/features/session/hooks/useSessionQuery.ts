import { SESSION_STALE_TIME_MS } from "@web/features/session/constants";
import { trpc } from "@web/lib/trpc";

type SessionGetOutput = NonNullable<
  ReturnType<ReturnType<typeof trpc.useUtils>["session"]["get"]["getData"]>
>;

type BaseOptions = Omit<
  NonNullable<Parameters<typeof trpc.session.get.useSuspenseQuery>[1]>,
  "queryKey" | "select"
>;

export function presetSessionCache(
  utils: ReturnType<typeof trpc.useUtils>,
  sessionId: string,
) {
  utils.session.get.setData(
    { sessionId },
    {
      id: sessionId,
      title: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: null,
      retrieval: null,
    },
  );
}

export function useSessionSuspenseQuery<TData = SessionGetOutput>(
  input: { sessionId: string },
  options?: BaseOptions & {
    select?: (data: SessionGetOutput) => TData;
  },
) {
  return trpc.session.get.useSuspenseQuery(input, {
    staleTime: SESSION_STALE_TIME_MS,
    ...options,
  }) as unknown as [
    TData,
    ReturnType<typeof trpc.session.get.useSuspenseQuery>[1],
  ];
}

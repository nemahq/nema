import { trpc } from "@web/lib/trpc";

const PROFILE_STALE_TIME_MS = 600_000;

type ProfileGetOutput = NonNullable<
  ReturnType<ReturnType<typeof trpc.useUtils>["profile"]["get"]["getData"]>
>;

type ProfileQueryBaseOptions = Omit<
  NonNullable<Parameters<typeof trpc.profile.get.useQuery>[1]>,
  "queryKey" | "select"
>;

type ProfileSuspenseQueryBaseOptions = Omit<
  NonNullable<Parameters<typeof trpc.profile.get.useSuspenseQuery>[1]>,
  "queryKey" | "select"
>;

export function useProfileQuery<TData = ProfileGetOutput>(
  options?: ProfileQueryBaseOptions & {
    select?: (data: ProfileGetOutput) => TData;
  },
) {
  // @ts-expect-error -- select generic bridge
  return trpc.profile.get.useQuery(undefined, {
    staleTime: PROFILE_STALE_TIME_MS,
    ...options,
  }) as unknown as ReturnType<typeof trpc.profile.get.useQuery>;
}

export function useProfileSuspenseQuery<TData = ProfileGetOutput>(
  options?: ProfileSuspenseQueryBaseOptions & {
    select?: (data: ProfileGetOutput) => TData;
  },
) {
  // @ts-expect-error -- select generic bridge
  return trpc.profile.get.useSuspenseQuery(undefined, {
    staleTime: PROFILE_STALE_TIME_MS,
    ...options,
  }) as unknown as [
    TData,
    ReturnType<typeof trpc.profile.get.useSuspenseQuery>[1],
  ];
}

import { trpc } from "@web/lib/trpc";

export function useDigestQuery(digestId: string) {
  return trpc.digest.get.useQuery({ digestId });
}

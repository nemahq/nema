import { trpc } from "@web/lib/trpc";

export function useDigestListQuery() {
  return trpc.digest.list.useQuery();
}

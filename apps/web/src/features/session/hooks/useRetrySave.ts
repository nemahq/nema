import { trpc } from "@web/lib/trpc";

export function useRetrySave() {
  return trpc.saveJob.retry.useMutation();
}

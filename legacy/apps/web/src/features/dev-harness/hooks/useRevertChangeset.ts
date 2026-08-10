import { trpc } from "@web/lib/trpc";

export function useRevertChangeset() {
  return trpc.changeset.revert.useMutation();
}

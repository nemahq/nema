import { trpc } from "@web/lib/trpc";

export function useArchiveSource() {
  return trpc.changeset.archiveSource.useMutation();
}

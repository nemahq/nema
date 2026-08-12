import { trpc } from "@web/lib/trpc";

export function useArchiveStatement() {
  return trpc.changeset.archiveStatement.useMutation();
}

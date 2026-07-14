import { trpc } from "@web/lib/trpc";

export function useTrashReference() {
  return trpc.reference.trash.useMutation();
}

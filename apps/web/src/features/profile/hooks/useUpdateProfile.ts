import { useMutation } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

export function useUpdateProfile() {
  const utils = trpc.useUtils();

  return useMutation(trpc.profile.update, {
    onSuccess() {
      utils.profile.get.invalidate();
    },
  });
}

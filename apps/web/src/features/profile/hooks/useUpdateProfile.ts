import { trpc } from "@web/lib/trpc";

export function useUpdateProfile() {
  const utils = trpc.useUtils();

  return trpc.profile.update.useMutation({
    onSuccess() {
      utils.profile.get.invalidate();
    },
  });
}

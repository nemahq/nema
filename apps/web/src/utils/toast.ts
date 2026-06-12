import { toast as weaveToast } from "@nema-io/weave";

import { getErrorMessage } from "@web/lib/getErrorMessage";

const toast = {
  ...weaveToast,
  error(message: string) {
    weaveToast.error(message, {
      duration: Infinity,
      cancel: { label: "✕", onClick: () => {} },
    });
  },
};

export function toastError(error: unknown): void {
  toast.error(getErrorMessage(error));
}

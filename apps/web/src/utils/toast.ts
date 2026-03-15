import { toast as weaveToast } from "@nema-io/weave";

export const toast = {
  ...weaveToast,
  error(message: string) {
    weaveToast.error(message, {
      duration: Infinity,
      cancel: { label: "✕", onClick: () => {} },
    });
  },
};

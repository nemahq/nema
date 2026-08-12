import { TRPCClientError } from "@trpc/client";

import { tolgee } from "@web/lib/tolgee/client";

export function getErrorMessage(error: unknown): string {
  if (!navigator.onLine) {
    return tolgee.t("error.network");
  }
  if (error instanceof TRPCClientError) {
    return error.message;
  }
  return tolgee.t("common.unknown_error");
}

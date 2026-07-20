import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import { useTranslation } from "@web/lib/tolgee";
import { toast } from "@web/utils/toast";

const SW_UPDATE_TOAST_ID = "sw-update-available";

export function ServiceWorkerUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(
    function notifyServiceWorkerUpdate() {
      if (!needRefresh) {
        return;
      }
      toast.info(t("app.update_available_message"), {
        id: SW_UPDATE_TOAST_ID,
        duration: Infinity,
        action: {
          label: t("app.update_available_action"),
          onClick: () => {
            void updateServiceWorker(true);
          },
        },
      });
    },
    [needRefresh, t, updateServiceWorker],
  );

  return null;
}

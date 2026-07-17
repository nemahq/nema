import { useEffect } from "react";

import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";
import { toast } from "@web/utils/toast";

import { useNotificationPermission } from "./useNotificationPermission";

// 네이티브 권한 거절은 사실상 영구적이라, 맥락 없이 띄우면 기능이 그 유저에게
// 영구히 죽는다 — 그래서 자체 UI로 먼저 물어보고(soft ask) 동의했을 때만
// Notification.requestPermission()을 호출한다. 첫 리뷰 화면 진입을 "첫 성공
// 순간"으로 보고 단 한 번만 묻는다.
export function useNotificationSoftAsk() {
  const { t } = useTranslation();
  const { isSupported, permission, requestPermission } =
    useNotificationPermission();

  useEffect(
    function showSoftAskOnce() {
      if (!isSupported || permission !== "default") {
        return;
      }
      if (getStorage("notificationSoftAskSeen") === "true") {
        return;
      }
      setStorage("notificationSoftAskSeen", "true");

      toast.info(t("notification.permission_prompt_message"), {
        duration: Infinity,
        cancel: { label: "✕", onClick: () => {} },
        action: {
          label: t("notification.permission_prompt_allow_action"),
          onClick: () => {
            void requestPermission();
          },
        },
      });
    },
    [isSupported, permission, requestPermission, t],
  );
}

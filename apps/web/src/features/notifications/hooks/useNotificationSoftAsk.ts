import { useEffect } from "react";

import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";
import { toast } from "@web/utils/toast";

import { useNotificationPermission } from "./useNotificationPermission";

// sonner에 같은 id로 다시 toast()를 부르면 새로 쌓이지 않고 기존 토스트를
// 갱신한다 — "seen" 플래그를 클릭 시점에만 찍기로 하면서, 배너를 무시한 유저가
// 리뷰 화면을 여러 번 들어올 때마다 토스트가 중복으로 쌓이는 걸 막기 위해 필요.
const SOFT_ASK_TOAST_ID = "notification-soft-ask";

// 네이티브 권한 거절은 사실상 영구적이라, 맥락 없이 띄우면 기능이 그 유저에게
// 영구히 죽는다 — 그래서 자체 UI로 먼저 물어보고(soft ask) 동의했을 때만
// Notification.requestPermission()을 호출한다. "seen" 플래그는 배너를 실제로
// 클릭(허용/닫기)했을 때만 찍는다 — 그냥 무시하고 지나간 경우까지 영구히 막아버리면
// 네이티브 거절과 같은 함정에 빠지기 때문.
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

      function markSeen() {
        setStorage("notificationSoftAskSeen", "true");
      }

      toast.info(t("notification.permission_prompt_message"), {
        id: SOFT_ASK_TOAST_ID,
        duration: Infinity,
        cancel: {
          label: "✕",
          onClick: markSeen,
        },
        action: {
          label: t("notification.permission_prompt_allow_action"),
          onClick: () => {
            markSeen();
            void requestPermission();
          },
        },
      });
    },
    [isSupported, permission, requestPermission, t],
  );
}

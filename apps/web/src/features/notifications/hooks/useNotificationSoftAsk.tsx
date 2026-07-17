import { useCallback } from "react";

import { BellIcon } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";
import { getStorage, setStorage } from "@web/utils/localStorage";
import { toast } from "@web/utils/toast";

import { useNotificationPermission } from "./useNotificationPermission";

// 같은 id로 다시 toast()를 부르면 새로 쌓이지 않고 기존 토스트를 갱신한다 —
// 여러 changeset을 잇달아 확정/버리는 유저에게 토스트가 중복으로 쌓이는 걸 막는다.
const SOFT_ASK_TOAST_ID = "notification-soft-ask";

// "seen" 플래그는 유저가 토스트를 실제로 닫았을 때만 찍는다 — 그냥 무시하고
// 지나간 경우까지 영구히 막아버리면 네이티브 권한 거절과 같은 함정에 빠지기
// 때문. 발화는 화면 진입 즉시가 아니라 호출자가 confirm/discard 성공 직후에
// 불러야 한다(가치를 체감하기 전에 물어보지 않기 위해).
export function useNotificationSoftAsk() {
  const { t } = useTranslation();
  const { isSupported, permission } = useNotificationPermission();

  return useCallback(
    function showSoftAskIfEligible() {
      if (!isSupported || permission !== "default") {
        return;
      }
      if (getStorage("notificationSoftAskSeen") === "true") {
        return;
      }

      toast.info(t("notification.permission_prompt_message"), {
        id: SOFT_ASK_TOAST_ID,
        icon: <BellIcon className="size-4" />,
        duration: Infinity,
        closeButton: true,
        onDismiss: () => {
          setStorage("notificationSoftAskSeen", "true");
        },
      });
    },
    [isSupported, permission, t],
  );
}

import { useRegisterSW } from "virtual:pwa-register/react";

import { useTranslation } from "@web/lib/tolgee";
import { toast } from "@web/utils/toast";

const SW_UPDATE_TOAST_ID = "sw-update-available";

// TanStack Router는 클라이언트 라우팅만 해서 브라우저가 자동으로 새 서비스워커를
// 체크하는 시점(풀 네비게이션)이 오래 켜둔 탭에는 영영 안 온다 — 직접 주기적으로
// 확인해야 한다.
const SW_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

// updateServiceWorker(true)는 내부적으로 controllerchange 이벤트가 와야 리로드
// 하는데, 하드 새로고침 등으로 controller가 없던 탭에선 이 이벤트가 아예 안
// 온다 — 일정 시간 안에 리로드가 안 되면 직접 새로고침한다. 정상 경로로 이미
// 페이지가 넘어갔다면 이 타이머는 언로드와 함께 사라지므로 무해하다.
const SW_UPDATE_RELOAD_FALLBACK_MS = 3000;

export function ServiceWorkerUpdatePrompt() {
  const { t } = useTranslation();

  const { updateServiceWorker } = useRegisterSW({
    onRegisteredSW: function scheduleUpdateChecks(_swUrl, registration) {
      if (!registration) {
        return;
      }
      setInterval(() => {
        void registration.update();
      }, SW_UPDATE_CHECK_INTERVAL_MS);
    },
    onNeedRefresh() {
      toast.info(t("app.update_available_message"), {
        id: SW_UPDATE_TOAST_ID,
        duration: Infinity,
        cancel: { label: "✕", onClick: () => {} },
        action: {
          label: t("app.update_available_action"),
          onClick: function handleUpdateClick(event) {
            event.preventDefault();
            setTimeout(
              () => window.location.reload(),
              SW_UPDATE_RELOAD_FALLBACK_MS,
            );
            void updateServiceWorker(true);
          },
        },
      });
    },
    // Sentry 없이는 보고할 곳이 없다 — 등록 실패 자체는 사용자에게 보이지 않고
    // 조용히 다음 방문까지 미등록 상태로 남는다(치명적이지 않음).
    onRegisterError() {},
  });

  return null;
}

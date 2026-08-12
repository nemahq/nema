import { useCallback, useState } from "react";

import { isNotificationSupported } from "@web/features/notifications/utils";

export function useNotificationPermission() {
  const isSupported = isNotificationSupported();
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    isSupported ? Notification.permission : "denied",
  );

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      return "denied" as const;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  return { isSupported, permission, requestPermission };
}

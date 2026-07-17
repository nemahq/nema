import { useNotificationSoftAsk } from "@web/features/notifications/hooks/useNotificationSoftAsk";

export function NotificationSoftAskTrigger() {
  useNotificationSoftAsk();
  return null;
}

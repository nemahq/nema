export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

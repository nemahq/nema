import { useRealtimeInvalidation } from "@web/features/realtime/hooks/useRealtimeInvalidation";

export function RealtimeSync() {
  useRealtimeInvalidation();
  return null;
}

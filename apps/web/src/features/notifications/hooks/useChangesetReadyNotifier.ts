import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { isNotificationSupported } from "@web/features/notifications/utils";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

interface ChangesetInsertRow {
  id: string;
  space_id: string;
}

// 탭이 보이는 동안엔 배지가 이미 실시간으로 갱신되므로, document.hidden일 때만
// OS 알림으로 같은 신호를 보완한다 — 중복 알림을 막기 위한 핵심 조건.
export function useChangesetReadyNotifier() {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const { t } = useTranslation();

  return useCallback(
    function notifyChangesetReady(row: ChangesetInsertRow) {
      if (
        !isNotificationSupported() ||
        Notification.permission !== "granted" ||
        !document.hidden
      ) {
        return;
      }
      const spacePublicId = utils.space.list
        .getData()
        ?.spaces.find((space) => space.id === row.space_id)?.publicId;
      if (!spacePublicId) {
        return;
      }

      const notification = new Notification(
        t("notification.changeset_ready_title"),
        { body: t("notification.changeset_ready_body") },
      );
      notification.onclick = function focusAndOpenReview() {
        window.focus();
        void navigate({
          to: "/space/$spacePublicId/review/$changesetId",
          params: { spacePublicId, changesetId: row.id },
        });
        notification.close();
      };
    },
    [navigate, t, utils],
  );
}

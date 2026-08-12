import { useCallback } from "react";
import * as Sentry from "@sentry/react";
import { useNavigate } from "@tanstack/react-router";

import {
  type ChangesetInsertRow,
  needsReviewNotification,
  resolveSpacePublicId,
} from "@web/features/notifications/changesetNotification";
import { isNotificationSupported } from "@web/features/notifications/utils";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

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
        !document.hidden ||
        !needsReviewNotification(row)
      ) {
        return;
      }
      const spacePublicId = resolveSpacePublicId(
        utils.space.list.getData()?.spaces,
        row.space_id,
      );
      if (!spacePublicId) {
        // space.list 캐시가 아직 안 채워졌거나 stale — 하필 탭 밖에 있는 동안이라
        // 사용자는 원인을 알 방법이 없다. 조용히 넘어가되 빈도는 파악해야 한다.
        Sentry.captureMessage(
          "Changeset ready notification skipped — space not cached",
          {
            level: "warning",
            extra: { spaceId: row.space_id },
          },
        );
        return;
      }

      try {
        const notification = new Notification(t("app.title"), {
          body: t("notification.changeset_ready_body"),
        });
        notification.onclick = function focusAndOpenReview() {
          window.focus();
          void navigate({
            to: "/space/$spacePublicId/changesets/$changesetNumber",
            params: { spacePublicId, changesetNumber: String(row.number) },
          });
          notification.close();
        };
      } catch (error) {
        // 일부 브라우저(Android Chrome 등)는 "Notification" in window가 true여도
        // 생성자 호출 자체를 거부한다 — 서비스워커의 showNotification()을 강제.
        Sentry.captureException(error, { tags: { feature: "notifications" } });
      }
    },
    [navigate, t, utils],
  );
}

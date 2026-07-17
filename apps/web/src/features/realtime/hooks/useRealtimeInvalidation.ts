import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";

import type { ChangesetInsertRow } from "@web/features/notifications";
import { useChangesetReadyNotifier } from "@web/features/notifications";
import { supabase } from "@web/lib/supabase";
import { trpc } from "@web/lib/trpc";

const CHANNEL_NAME = "realtime-invalidation";

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type NotifyChangesetReady = ReturnType<typeof useChangesetReadyNotifier>;

// Supabase Realtime(Postgres CDC)로 비동기 작업 완료를 폴링 없이 반영한다.
// 설계: payload를 캐시에 직접 patch하지 않고 "바뀌었다" 신호로만 써서 해당 쿼리를
// invalidate한다 — 서버 응답 shape에 안 묶여 견고하고, RLS 필터를 포함한 기존 조회
// 로직을 그대로 재사용한다. RLS가 브로드캐스트를 구독자 Space로 스코프하지만, 설령
// 범위 밖 이벤트가 새더라도 invalidate는 자기 데이터를 다시 읽을 뿐이라 유출이 없다.
export function useRealtimeInvalidation() {
  // 채널은 앱 세션당 하나면 충분하다(마운트 1회). utils의 참조 안정성은 문서화 안 된
  // trpc 내부 memo에 달려 있어 deps로 삼으면 버전업 시 조용히 채널이 churn할 수 있다 —
  // 대신 최신 utils를 ref로 넘겨 구독은 마운트 시 한 번만 건다.
  const utils = trpc.useUtils();
  const utilsRef = useRef<TrpcUtils>(utils);
  useEffect(
    function syncUtilsRef() {
      utilsRef.current = utils;
    },
    [utils],
  );

  // notifyChangesetReady도 같은 이유(구독은 마운트 시 한 번만)로 ref에 담아 최신
  // 참조만 넘긴다 — 다만 이쪽은 utils뿐 아니라 navigate·t도 의존하는 만큼 식별자가
  // utils보다 훨씬 자주 바뀔 수 있어, deps로 삼지 않는 실익이 utilsRef보다 크다.
  const notifyChangesetReady = useChangesetReadyNotifier();
  const notifyChangesetReadyRef =
    useRef<NotifyChangesetReady>(notifyChangesetReady);
  useEffect(
    function syncNotifyChangesetReadyRef() {
      notifyChangesetReadyRef.current = notifyChangesetReady;
    },
    [notifyChangesetReady],
  );

  useEffect(function subscribeRealtimeInvalidation() {
    function invalidatePendingSources() {
      void utilsRef.current.source.listPending.invalidate();
    }
    function invalidateChangesetBadges() {
      void utilsRef.current.space.list.invalidate();
      void utilsRef.current.changeset.listChangesets.invalidate();
    }
    function handleChangesetInsert(
      payload: RealtimePostgresInsertPayload<ChangesetInsertRow>,
    ) {
      invalidateChangesetBadges();
      notifyChangesetReadyRef.current(payload.new);
    }

    const channel = supabase
      .channel(CHANNEL_NAME)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sources" },
        invalidatePendingSources,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "changesets" },
        handleChangesetInsert,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "changesets" },
        invalidateChangesetBadges,
      )
      .subscribe(function reportChannelFailure(status, error) {
        // 채널이 끊기면(RLS 미스매치·publication 미반영·JWT 만료·프록시 차단 등)
        // 이 배지들을 채우는 실시간 신호가 조용히 사라진다 — 탭을 계속 보는
        // 사용자에겐 refetchOnWindowFocus 폴백도 안 걸리므로, 대체한 critical
        // 쿼리와 같은 급으로 실패를 반드시 보고한다.
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          Sentry.captureMessage("Realtime invalidation channel failed", {
            level: "warning",
            extra: { status, error: error?.message },
          });
        }
      });

    return function unsubscribe() {
      void supabase.removeChannel(channel);
    };
  }, []);
}

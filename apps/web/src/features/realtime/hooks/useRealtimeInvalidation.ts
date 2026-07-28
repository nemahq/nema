import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { getQueryKey } from "@trpc/react-query";

import type { ChangesetInsertRow } from "@web/features/notifications";
import { useChangesetReadyNotifier } from "@web/features/notifications";
import { supabase } from "@web/lib/supabase";
import { queryClient } from "@web/lib/tanstack-query";
import { trpc } from "@web/lib/trpc";

import { invalidateUnlessFresh } from "./invalidateUnlessFresh";

const CHANNEL_NAME = "realtime-invalidation";

// digestion 파이프라인이 소스 하나를 처리하며 sources row를 여러 번 UPDATE하므로,
// 짧은 간격으로 연달아 오는 이벤트를 마지막 것 기준 한 번으로 묶는다.
const PENDING_SOURCES_INVALIDATE_DEBOUNCE_MS = 500;

// row 모양이 뭐든(sources·changesets 둘 다 재사용) commit_timestamp 하나만
// 있으면 되므로, Supabase가 주는 제네릭 payload 타입 대신 이 최소 타입을 쓴다.
interface RealtimeCommit {
  commit_timestamp: string;
}

// trpc는 모듈 스코프에서 안정적인 참조라(Provider 없이도 _def 경로 메타데이터만
// 읽음) 렌더 밖에서 한 번만 계산해도 된다. type·input을 안 주면 prefix 키가
// 나와 findAll의 partial match와 함께 실제 input이 뭐든(예: changeset 탭별
// 필터) 다 잡는다 — type을 박아넣으면 그 쿼리가 실제로 쓰는 type(예: infinite)과
// 달라 매칭이 아예 안 될 위험이 있다.
const PENDING_SOURCES_QUERY_KEY = getQueryKey(trpc.source.listPending);
const SPACE_LIST_QUERY_KEY = getQueryKey(trpc.space.list);
const CHANGESET_LIST_QUERY_KEY = getQueryKey(trpc.changeset.listChangesets);

type NotifyChangesetReady = ReturnType<typeof useChangesetReadyNotifier>;

// Supabase Realtime(Postgres CDC)로 비동기 작업 완료를 폴링 없이 반영한다.
// 설계: payload를 캐시에 직접 patch하지 않고 "바뀌었다" 신호로만 써서 해당 쿼리를
// invalidate한다 — 서버 응답 shape에 안 묶여 견고하고, RLS 필터를 포함한 기존 조회
// 로직을 그대로 재사용한다. RLS가 브로드캐스트를 구독자 Space로 스코프하지만, 설령
// 범위 밖 이벤트가 새더라도 invalidate는 자기 데이터를 다시 읽을 뿐이라 유출이 없다.
export function useRealtimeInvalidation() {
  // 채널은 앱 세션당 하나면 충분하다(마운트 1회). notifyChangesetReady는
  // navigate·t에 의존해 자주 바뀌므로 deps로 삼지 않고 ref로 최신 참조만 넘긴다.
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
    let pendingSourcesTimer: ReturnType<typeof setTimeout> | undefined;
    function invalidatePendingSources(payload: RealtimeCommit) {
      clearTimeout(pendingSourcesTimer);
      // 디바운스 도중 이 UPDATE보다 늦게 커밋된 이벤트가 또 오면 타이머가 다시
      // 걸리면서 changedAt도 그 최신 이벤트 것으로 자연히 갱신된다.
      const changedAt = payload.commit_timestamp;
      pendingSourcesTimer = setTimeout(
        function flushPendingSourcesInvalidate() {
          invalidateUnlessFresh(
            queryClient,
            PENDING_SOURCES_QUERY_KEY,
            changedAt,
          );
        },
        PENDING_SOURCES_INVALIDATE_DEBOUNCE_MS,
      );
    }
    function invalidateChangesetBadges(payload: RealtimeCommit) {
      const changedAt = payload.commit_timestamp;
      return Promise.all([
        invalidateUnlessFresh(queryClient, SPACE_LIST_QUERY_KEY, changedAt),
        invalidateUnlessFresh(queryClient, CHANGESET_LIST_QUERY_KEY, changedAt),
      ]);
    }
    async function handleChangesetInsert(
      payload: RealtimePostgresInsertPayload<ChangesetInsertRow>,
    ) {
      // 배지·목록이 실제로 새로고침을 마친 뒤에 알림을 띄운다 — 먼저 띄우면
      // 탭으로 돌아왔을 때 알림은 이미 떴는데 화면은 아직 못 따라온 것처럼 보인다.
      await invalidateChangesetBadges(payload);
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
      clearTimeout(pendingSourcesTimer);
      void supabase.removeChannel(channel);
    };
  }, []);
}

import { DateTime, type WeekdayNumbers } from "luxon";

import type { TimeAnchor, TimeToken, Weekday } from "./token";

// 시간 토큰 → 날짜 범위 환산 (temporal-query-design 4장).
// 질의 파싱(기준=now)과 기한 추출(기준=글 작성 시각)이 같은 함수를 기준 시각만 바꿔 쓴다.
//
// 글로벌 제품이라 "이번 주"·"오늘"의 경계는 사용자 존 기준이어야 한다 — UTC로 풀면
// 한국 사용자의 하루가 어긋난다. 그래서 timeZone(IANA)을 받아 그 존에서 달력 산술을 하고,
// 존·DST 정확성은 Luxon에 맡긴다. 존의 출처(요청 전달·작성 존 저장)는 호출부 몫.

export interface TimeRange {
  // 한쪽이 null이면 열린 범위. by(마감)는 아래끝을 열어 둔다 — '지난 마감'을 now로 자를지는
  // 검색 레이어의 제품 판단이라 resolver는 순수하게 둔다(설계 9장).
  from: Date | null;
  // 포함 끝 — 그 기간의 마지막 순간(23:59:59.999). 소비처는 `<= to`로 거른다(반열림 아님).
  to: Date | null;
}

export interface ResolveContext {
  reference: Date;
  /** IANA 존 (예: "Asia/Seoul"). */
  timeZone: string;
}

const ISO_WEEKDAY: Record<Weekday, WeekdayNumbers> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

export function resolveTimeToken(
  token: TimeToken,
  context: ResolveContext,
): TimeRange {
  const reference = DateTime.fromJSDate(context.reference, {
    zone: context.timeZone,
  });
  if (!reference.isValid) {
    throw new Error(
      `resolveTimeToken: invalid reference/timeZone (${context.timeZone}: ${reference.invalidReason})`,
    );
  }

  // field(created/due)는 여기서 안 쓴다 — 어느 컬럼에 거나는 호출부(검색·추출)의 몫이고,
  // resolver는 날짜 범위만 낸다.
  const period = resolveAnchorPeriod(token.anchor, reference);

  return {
    from: token.boundary === "by" ? null : period.start.toJSDate(),
    to: period.end.toJSDate(),
  };
}

interface Period {
  start: DateTime;
  end: DateTime;
}

// Luxon의 주는 ISO(월요일 시작)라 설계의 주 시작 규칙과 일치한다.
function resolveAnchorPeriod(anchor: TimeAnchor, reference: DateTime): Period {
  switch (anchor.kind) {
    case "relative": {
      const shifted = reference.plus({ [`${anchor.grain}s`]: anchor.offset });
      return {
        start: shifted.startOf(anchor.grain),
        end: shifted.endOf(anchor.grain),
      };
    }
    case "weekday": {
      const inThisWeek = reference.set({ weekday: ISO_WEEKDAY[anchor.day] });
      const day =
        anchor.scope === "next" ? inThisWeek.plus({ weeks: 1 }) : inThisWeek;
      return { start: day.startOf("day"), end: day.endOf("day") };
    }
    case "absolute": {
      const day = DateTime.fromISO(anchor.date, { zone: reference.zone });
      if (!day.isValid) {
        throw new Error(
          `resolveTimeToken: invalid absolute date (${anchor.date}: ${day.invalidReason})`,
        );
      }
      return { start: day.startOf("day"), end: day.endOf("day") };
    }
  }
}

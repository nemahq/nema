import { type ComponentProps, Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { cn, Skeleton } from "@nema-io/weave";
import { ChevronRight } from "@nema-io/weave/icons";

type LinkComponentProps = ComponentProps<typeof Link>;

export interface NavigationBarItem {
  label: string;
  icon?: ReactNode;
  // to가 없으면 현재 위치 — 클릭 불가한 평문으로 렌더된다. TanStack Router의
  // Link 제네릭(to에 물린 리터럴에 따라 params/search 모양이 바뀜)은 배열 원소
  // 하나의 타입으로 못 담아 느슨한 string으로 받고, 실제 라우트 존재는 호출부가
  // 문자열 리터럴을 그대로 쓰는 것으로 보장한다(아래 렌더 지점의 단언 참고).
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

interface NavigationBarProps {
  // 아직 items를 채울 데이터(예: Space 이름)가 없는 로딩 구간엔 통째로 생략한다 —
  // 항목별로 따로 로딩되는 모습 대신 자리만 차지하는 스켈레톤 한 덩어리로 대체된다
  // (ChangesetDetailScreen 논의 참고).
  items?: NavigationBarItem[];
  rightContent?: ReactNode;
}

// 스크롤 컨테이너 밖(형제)에 렌더해서 쓴다 — sticky로 안에 두면 관성 스크롤
// 바운스에 같이 끌려간다(DraftsScreen에서 확인된 문제). 콘텐츠 제목의 미러링이
// 아니라 지금 위치를 알려주는 내비게이션 chrome이라, 아래 콘텐츠 폭과 맞출
// 필요가 없다(Notion 브레드크럼과 같은 성격).
//
// items가 1개면 breadcrumb 없이 단일 라벨로, 여러 개면 항목 사이에 구분자가
// 붙는다 — 항목이 아닌 이 화면이 "지금 어디 있는지"를 나타내는 값이므로 링크도
// 평문과 똑같이 보이게 한다(색·밑줄로 강조하지 않음). 마지막 항목(현재 위치)은
// 뒤에 더 긴 텍스트(예: changeset 제목)가 오는 경우가 많아 폭을 더 준다.
export function NavigationBar({ items, rightContent }: NavigationBarProps) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between overscroll-none border-b border-border/50 bg-surface-card px-4">
      <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-fg-primary">
        {items === undefined && <Skeleton className="h-4 w-56" />}
        {items?.map((item, index) => {
          const isLast = index === (items?.length ?? 0) - 1;
          const label = (
            <span
              className={cn(
                "min-w-0 truncate",
                isLast ? "max-w-96" : "max-w-48",
              )}
            >
              {item.label}
            </span>
          );
          return (
            <Fragment key={index}>
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-fg-tertiary/60" />
              )}
              {item.to ? (
                // NavigationBarItem 주석 참고 — 배열 원소 하나의 타입으로는
                // Link의 to별 params/search 제네릭을 못 물어 여기서 되돌려 준다.
                <Link
                  to={item.to as LinkComponentProps["to"]}
                  params={item.params as LinkComponentProps["params"]}
                  search={item.search as LinkComponentProps["search"]}
                  className="flex min-w-0 shrink items-center gap-1.5"
                >
                  {item.icon}
                  {label}
                </Link>
              ) : (
                <span className="flex min-w-0 shrink items-center gap-1.5">
                  {item.icon}
                  {label}
                </span>
              )}
            </Fragment>
          );
        })}
      </div>
      {rightContent}
    </div>
  );
}

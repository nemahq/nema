import type { ReactNode } from "react";

interface LabelChipRowProps {
  query: string;
  disabled: boolean;
  // 개수 제한에 걸리면 입력 자체를 감춘다 — 더 고를 수 없는데 검색창만 남으면
  // 고장난 것처럼 보인다(사유는 아래 LabelLimitNotice가 대신 말해준다).
  searchable: boolean;
  maxLength?: number;
  // placeholder를 안 두는 대신(아래 이유) 스크린리더용 이름은 필수로 받는다.
  ariaLabel: string;
  onQueryChange: (query: string) => void;
  children: ReactNode;
}

// Notion 참고 — 칩이 놓인 영역 자체가 인풋이라 거기서 바로 검색·추가가 된다
// (design-decisions-log.md). 그래서 칩 목록과 검색 입력을 별도 팝오버로 안 쪼개고
// 한 행에 같이 둔다. 칩 자체는 Topic·Tag가 각자 렌더한다 — 라벨 필드 이름도
// 제거 문구도 달라서, 여기서 공유하는 건 "칩들과 인풋이 한 행"이라는 배치뿐이다.
export function LabelChipRow({
  query,
  disabled,
  searchable,
  maxLength,
  ariaLabel,
  onQueryChange,
  children,
}: LabelChipRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
      {children}
      {searchable && (
        // weave Input 대신 raw — border·h-9·px-3 같은 base chrome을 걷어내면 남는 게
        // 없어서, 칩과 한 행에 이어 붙는 무테두리 인라인 입력엔 안 맞는다.
        // placeholder를 여기 안 두는 이유 — 칩이 쌓일수록 이 인풋 자체가 좁아져
        // 문구가 잘릴 수 있어서, 안내문은 아래 리스트 위 고정 폭 자리에 따로 둔다.
        <input
          value={query}
          disabled={disabled}
          maxLength={maxLength}
          aria-label={ariaLabel}
          onChange={(e) => onQueryChange(e.target.value)}
          // leading-6(24px) — 옆 Chip(패딩+보더 포함 약 22.8px)보다 확실히 커야
          // 이 인풋이 항상 행 높이를 주도한다. 칩이 없을 때(인풋만)와 있을 때
          // (칩+인풋) 사이에서 행 높이가 칩 유무에 따라 갈리지 않게 하기 위함.
          className="min-w-[4rem] flex-1 border-none bg-transparent text-sm leading-6 outline-none disabled:pointer-events-none"
        />
      )}
    </div>
  );
}

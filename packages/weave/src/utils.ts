import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// DropdownMenu/Select처럼 서로 다른 Radix primitive(액션 메뉴 vs 폼 컨트롤)를 쓰지만
// 화면에 떠 있는 표면(배경·보더·그림자)만큼은 같은 룩이어야 하는 팝업 콘텐츠가
// 공유하는 표면 스타일. 보더는 라이트·다크 공통, 그림자는 라이트에서만(다크는
// 보더만으로 경계를 표현). 배경은 surface-overlay 전용 토큰 — 라이트는 card와
// 같은 흰색이지만, 다크는 LNB·메인·사이드뷰 어디와도 안 겹치는 새 톤이다.
export const POPOVER_SURFACE_CLASSNAME =
  "rounded-md border border-border/50 bg-surface-overlay text-fg-primary shadow-[0_2px_10px_rgba(0,0,0,0.05)] dark:shadow-none";

// min-w-0: flex item 기본값(min-width: auto)이 내용 크기 이하로 안 줄어들게
// 막아서, 이게 없으면 truncate가 있어도 패널이 좁아질 때 pill이 안 줄어들고
// 줄바꿈으로 흘러넘친다.
export const SPACE_PILL_CLASSNAME =
  "-ml-2.5 min-w-0 truncate rounded-full bg-fg-primary/10 px-2.5 py-1 text-xs";

import type { TopicStatus } from "@nema-io/shared";

interface TopicRowProps {
  title: string;
  status: TopicStatus;
}

// 읽기 전용 행 — 이름변경·아카이브·되살리기를 스코프 밖에 두는 이유는
// TopicsPanel 주석 참고.
export function TopicRow({ title, status }: TopicRowProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 p-2">
      <span
        className={
          status === "archived"
            ? "text-[10px] uppercase text-fg-tertiary"
            : "text-[10px] uppercase text-status-success"
        }
      >
        {status}
      </span>
      <span className="flex-1 text-sm text-fg-primary">{title}</span>
    </div>
  );
}

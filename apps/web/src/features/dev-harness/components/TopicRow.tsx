import type { TopicStatus } from "@nema-io/shared";

interface TopicRowProps {
  title: string;
  status: TopicStatus;
}

// 이름변경·아카이브·되살리기는 하니스 스코프 밖(평범한 CRUD)이라 여기 두지
// 않는다 — 인제스천 확정으로 어떤 Topic이 만들어졌는지 관찰하는 읽기 전용 행.
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

import { Textarea } from "@nema-io/weave";

interface SourceBodyViewProps {
  body: string;
}

// 편집 없는 읽기 전용 본문 — 순수 textarea라 개행을 그대로 보존한다.
export function SourceBodyView({ body }: SourceBodyViewProps) {
  return (
    <Textarea variant="borderless" value={body} readOnly className="flex-1" />
  );
}

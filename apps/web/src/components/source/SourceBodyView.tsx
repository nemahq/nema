import { Textarea } from "@nema-io/weave";

interface SourceBodyViewProps {
  value: string;
}

// 편집 없는 읽기 전용 본문 — 순수 textarea라 개행을 그대로 보존한다.
export function SourceBodyView({ value }: SourceBodyViewProps) {
  return (
    <Textarea variant="borderless" value={value} readOnly className="flex-1" />
  );
}

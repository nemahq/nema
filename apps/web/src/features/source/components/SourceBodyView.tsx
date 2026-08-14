import { Textarea } from "@nema-io/weave";

interface SourceBodyViewProps {
  body: string;
}

// 편집 없는 읽기 전용 본문 — 순수 textarea라 개행을 그대로 보존한다. autoSize로
// 내용 높이만큼 늘어나게 해, 스크롤은 이 textarea가 아니라 감싸는 패널 쪽에서
// 한다 — 여기서 자체 스크롤하면 제목이 스크롤 밖에 고정돼 버린다.
export function SourceBodyView({ body }: SourceBodyViewProps) {
  return <Textarea variant="borderless" value={body} readOnly autoSize />;
}

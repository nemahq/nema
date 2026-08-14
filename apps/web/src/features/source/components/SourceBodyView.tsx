import { Textarea } from "@nema-io/weave";

interface SourceBodyViewProps {
  body: string;
}

// 편집 없는 읽기 전용 본문 — 순수 textarea라 개행을 그대로 보존한다. autoSize로
// 내용 높이만큼 늘어나게 해, 스크롤은 이 textarea가 아니라 감싸는 패널 쪽에서
// 한다 — 여기서 자체 스크롤하면 제목이 스크롤 밖에 고정돼 버린다.
// shrink-0 — autoSize가 붙이는 overflow-hidden 때문에 이 textarea는 flex item
// 자동 최소 크기가 0이라(overflow가 visible이 아닌 flex item의 스펙 규칙),
// 감싸는 flex-col 패널이 비좁으면 넘치는 대신 이 textarea가 짜부러들어 본문이
// 통째로 잘려 보이고 패널 자체는 스크롤할 게 없어진다. shrink-0으로 전체
// 콘텐츠 높이를 지켜 패널이 대신 넘치게(그래서 스크롤되게) 한다.
export function SourceBodyView({ body }: SourceBodyViewProps) {
  return (
    <Textarea
      variant="borderless"
      value={body}
      readOnly
      autoSize
      className="shrink-0"
    />
  );
}

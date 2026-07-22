import type { Change } from "diff";

interface ReferenceMergeDiffProps {
  // 호출부(ReferenceMergeDiffDisclosure)가 토글을 보여줄지 판단할 때도 같은
  // diffWords 결과가 필요해서, 여기서 다시 계산하지 않고 그대로 받는다.
  segments: Change[];
}

// 모양(취소선/밑줄)이 add·delete를 구분하고 색은 비대칭 보조 신호만 — 삭제는
// 흐리게 약화, 추가만 강조. text-status-success는 ReferenceCandidateCard의
// 신규 레퍼런스 "+" 표시와 같은 색이라 "새로 생기는 내용"이라는 의미가 통일된다
// — 삭제 쪽에 경쟁하는 색(빨강 등)이 없어 적록색맹 문제는 여전히 없다.
// fg-quinary(disabled 전용, 배경 대비 ~2.3:1)가 아니라 fg-quaternary를 쓴다 —
// 취소선으로 이미 "삭제됨"이 표시되니 색까지 disabled 수준으로 낮출 필요가
// 없고, 무엇이 지워졌는지는 여전히 읽을 수 있어야 한다.
//
// 안 바뀐 구간(기본값)은 text-fg-tertiary — 편집 필드가 이미 text-fg-primary라,
// diff 대부분을 차지하는 이 구간이 같은 색이면 "본문이 위아래로 한 번 더 있다"는
// 인상을 준다. 참고용 보조 정보로 확실히 물러나게 해 실제로 바뀐 곳만 도드라지게
// 한다.
export function ReferenceMergeDiff({ segments }: ReferenceMergeDiffProps) {
  return (
    <p className="text-sm leading-relaxed text-fg-tertiary">
      {segments.map((segment, index) => {
        if (segment.removed) {
          return (
            <span key={index} className="text-fg-quaternary line-through">
              {segment.value}
            </span>
          );
        }
        if (segment.added) {
          return (
            <span
              key={index}
              className="font-medium text-status-success underline"
            >
              {segment.value}
            </span>
          );
        }
        return <span key={index}>{segment.value}</span>;
      })}
    </p>
  );
}

import { diffWords } from "diff";

interface ReferenceMergeDiffProps {
  original: string;
  revised: string;
}

// 모양(취소선/밑줄)이 add·delete를 구분하고 색은 비대칭 보조 신호만 — 삭제는
// 흐리게 약화, 추가만 강조. text-status-success는 ReferenceCandidateCard의
// 신규 레퍼런스 "+" 표시와 같은 색이라 "새로 생기는 내용"이라는 의미가 통일된다
// — 삭제 쪽에 경쟁하는 색(빨강 등)이 없어 적록색맹 문제는 여전히 없다.
export function ReferenceMergeDiff({
  original,
  revised,
}: ReferenceMergeDiffProps) {
  const segments = diffWords(original, revised);

  return (
    <p className="text-sm leading-relaxed text-fg-primary">
      {segments.map((segment, index) => {
        if (segment.removed) {
          return (
            <span key={index} className="text-fg-quinary line-through">
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

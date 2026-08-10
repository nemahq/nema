import { Text } from "@nema-io/weave";

interface LabelLimitNoticeProps {
  message: string;
}

// 검색 UI를 통째로 숨기기만 하면 "왜 안 되는지" 설명이 없어 고장난 것처럼 보인다 —
// 개수 제한에 걸렸다는 걸 직접 알려준다.
export function LabelLimitNotice({ message }: LabelLimitNoticeProps) {
  return (
    <Text size="xs" color="tertiary" className="px-2 pb-2">
      {message}
    </Text>
  );
}

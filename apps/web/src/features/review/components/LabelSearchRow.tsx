import { Badge, ComboboxItem } from "@nema-io/weave";

interface LabelSearchRowProps {
  label: string;
  // 이 Digest에 이미 붙은 라벨도 목록에서 그대로 보여준다 — "붙은 것"과 "안
  // 붙은 것"을 둘로 쪼개지 않고 이 목록 하나로 통일하기 위해서다. 대신 이미
  // 붙은 행은 클릭해도 다시 안 붙는다.
  attached: boolean;
  onSelect: () => void;
}

// 후보 이름을 위쪽 칩 목록과 같은 Badge로 감싼다 — 고르면 그대로 저 모양의 칩이
// 된다는 걸 고르기 전에 미리 보여준다.
export function LabelSearchRow({
  label,
  attached,
  onSelect,
}: LabelSearchRowProps) {
  return (
    <li>
      <ComboboxItem
        alreadySelected={attached}
        onClick={onSelect}
        buttonClassName="py-1"
      >
        <Badge
          variant={attached ? "neutral" : "outline"}
          shape="rounded"
          truncated
        >
          {label}
        </Badge>
      </ComboboxItem>
    </li>
  );
}

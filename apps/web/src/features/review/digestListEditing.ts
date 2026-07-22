// start와 end 사이(선택 영역)는 버린다 — start만 받으면 선택된 채로 Enter를
// 눌렀을 때 그 텍스트가 삭제되지 않고 다음 줄로 통째로 넘어간다.
export function splitListItem(
  items: string[],
  itemIndex: number,
  start: number,
  end: number,
): string[] {
  const next = [...items];
  next[itemIndex] = items[itemIndex].slice(0, start);
  next.splice(itemIndex + 1, 0, items[itemIndex].slice(end));
  return next;
}

export function mergeListItemIntoPrevious(
  items: string[],
  itemIndex: number,
): string[] {
  const previous = items[itemIndex - 1];
  const next = [...items];
  next[itemIndex - 1] = previous + items[itemIndex];
  next.splice(itemIndex, 1);
  return next;
}

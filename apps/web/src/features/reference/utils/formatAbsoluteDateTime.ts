// 목록의 "최종 수정" 컬럼은 다른 화면의 상대 시각과 달리 절대 시각을 쓴다
// (surface-inventory.md "Reference 목록" — 사전·위키 찾아보기 목적이라 정밀도가
// 상대 시각보다 더 중요하다고 판단됨).
export function formatAbsoluteDateTime(dateTime: string): string {
  const date = new Date(dateTime);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

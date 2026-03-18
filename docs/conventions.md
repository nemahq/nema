# Code Conventions

## 분기 패턴

- 같은 판별자(discriminant)에 대한 값 매핑은 `Record` 맵 객체를 우선 사용한다.
- 분기마다 부수효과가 있거나 조건이 단순 동등비교가 아닌 경우에만 `if`/`switch`를 사용한다.

```tsx
// BAD — if 연쇄로 값 매핑
function getIcon(status: Status) {
  if (status === "success") return <Check />;
  if (status === "error") return <Alert />;
  return <Loader />;
}

// GOOD — Record 맵
const STATUS_ICON: Record<Status, React.ReactNode> = {
  success: <Check />,
  error: <Alert />,
  loading: <Loader />,
};
```

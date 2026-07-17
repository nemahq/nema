import type { ComponentProps } from "react";
import { Link } from "@tanstack/react-router";

type LinkComponentProps = ComponentProps<typeof Link>;

// TanStack Router의 Link는 to에 물린 리터럴에 따라 params/search 모양이 바뀌는
// 제네릭이라, 리스트·breadcrumb 항목처럼 여러 라우트를 배열 하나의 타입으로
// 담아야 하는 자리에서는 그 상관관계를 못 지킨다. 이 느슨한 타입으로 받고,
// 실제 라우트 존재는 호출부가 linkOptions()로 검증한 뒤 이 shape에 맞춰
// 스프레드하는 것으로 보장한다 — asLinkProps()에서만 되돌려 준다.
export interface LooseLinkTarget {
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
}

export function asLinkProps(target: LooseLinkTarget) {
  return {
    to: target.to as LinkComponentProps["to"],
    params: target.params as LinkComponentProps["params"],
    search: target.search as LinkComponentProps["search"],
  };
}

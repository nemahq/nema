// MCP와 웹이 같은 tRPC 프로시저를 공유해서 인증 정보만으로는 호출 출처를 못
// 가른다 — MCP_CLIENT_HEADER_NAME(apps/mcp가 심는 헤더)로 구분한다. source.get의
// MCP 전용 조회 로그(logGetSource)가 이 값을 쓴다.
//
// 헤더는 누구나 흉내 낼 수 있는 자기신고 값이다 — RLS처럼 서버가 독립적으로
// 검증하는 값이 아니다. 로깅 지표를 어느 쪽에 남길지 가르는 용도로만 쓴다.
// 인가(authorization) 판단에는 절대 재사용하지 않는다.
//
// trpc.ts가 아닌 별도 파일에 둔다 — services/source-service.ts가 이 타입만
// 필요한데 trpc.ts를 통째로 참조하면, error-mapper.ts(trpc.ts가 참조)가
// source-service.ts를 참조할 때 순환 의존이 생긴다.
export type RequestOrigin = "mcp" | "web";

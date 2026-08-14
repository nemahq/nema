// MCP 전용 헤더 — apps/mcp가 tRPC 호출에 실어 보내고 apps/server(createContext)가
// 읽어 요청 출처(MCP vs 웹)를 구분한다. 웹과 MCP가 같은 tRPC 프로시저(source.get)를
// 공유해서 ctx의 인증 정보만으로는 둘을 가를 수 없다 — MCP는 원래 사용자 토큰만
// 그대로 넘기지 자기 정체성을 안 실어 보낸다. 값이 없거나 다르면 웹으로 간주한다.
export const MCP_CLIENT_HEADER_NAME = "x-nema-client";
export const MCP_CLIENT_HEADER_VALUE = "mcp";

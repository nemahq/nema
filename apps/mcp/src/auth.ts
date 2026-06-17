import { getEnv, getOAuthIssuer } from "@mcp/env";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createClient } from "@supabase/supabase-js";

const MCP_CLIENT_ID = "nema-mcp";

// access token 검증을 Supabase auth.getUser에 위임한다. getUser는 서버측 호출이라
// 서명 알고리즘과 무관하게 유효성을 판정한다(HS256/비대칭 어느 쪽이든).
export function createSupabaseTokenVerifier(): OAuthTokenVerifier {
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) {
        throw new InvalidTokenError("Invalid or expired access token");
      }
      return { token, clientId: MCP_CLIENT_ID, scopes: [] };
    },
  };
}

// RFC 9728 Protected Resource Metadata. 클라이언트는 authorization_servers를 보고
// Supabase OAuth 서버로 가서 로그인한 뒤 토큰을 받아 다시 이 서버에 붙는다.
export function protectedResourceMetadata() {
  return {
    resource: getEnv().MCP_PUBLIC_URL,
    authorization_servers: [getOAuthIssuer()],
    scopes_supported: [] as string[],
    resource_name: "nema",
  };
}

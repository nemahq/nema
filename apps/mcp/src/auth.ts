import { getEnv, getOAuthIssuer } from "@mcp/env";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createClient } from "@supabase/supabase-js";

const MCP_CLIENT_ID = "nema-mcp";

// requireBearerAuth는 AuthInfo.expiresAt(숫자)를 필수로 본다(없으면 유효 토큰도 401).
// 이미 검증된 JWT의 exp 클레임에서 만료 시각을 읽어 채운다.
function readTokenExpiry(token: string): number {
  const segment = token.split(".")[1];
  if (!segment) {
    throw new InvalidTokenError("Malformed access token");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new InvalidTokenError("Malformed access token");
  }
  const exp =
    typeof payload === "object" && payload !== null && "exp" in payload
      ? (payload as { exp: unknown }).exp
      : undefined;
  if (typeof exp !== "number") {
    throw new InvalidTokenError("Access token has no expiration");
  }
  return exp;
}

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
      return {
        token,
        clientId: MCP_CLIENT_ID,
        scopes: [],
        expiresAt: readTokenExpiry(token),
      };
    },
  };
}

// RFC 9728 Protected Resource Metadata. 클라이언트는 authorization_servers를 보고
// Supabase OAuth 서버로 가서 로그인한 뒤 토큰을 받아 다시 이 서버에 붙는다.
export function protectedResourceMetadata() {
  return {
    resource: getEnv().MCP_PUBLIC_URL,
    authorization_servers: [getOAuthIssuer()],
    resource_name: "nema",
  };
}

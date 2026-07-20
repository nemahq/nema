/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __COMMIT_SHA__: string;
declare const __BUILD_TIMESTAMP__: string;

declare module "*.mdx" {
  import type { ComponentType } from "react";
  const Component: ComponentType;
  export default Component;
}

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_SENTRY_DSN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

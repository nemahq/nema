/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare const __COMMIT_SHA__: string;
declare const __BUILD_TIMESTAMP__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TOLGEE_CDN_URL?: string;
  readonly VITE_PREVIEW_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

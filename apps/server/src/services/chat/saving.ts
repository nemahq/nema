import type { ContentLanguage } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";

// TODO(NEM-86): Memory 모델 저장 파이프라인으로 재구현
export async function handleSave(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  sessionId: string;
  draftBody: string;
  contentLanguage: ContentLanguage;
}): Promise<string[]> {
  throw new Error(
    `saving pipeline not yet implemented for Memory model (user=${args.userId})`,
  );
}

import type { AppEnv } from "@server/env";
import type { LlmProvider } from "@server/infra/llm/llm-provider";

// 프로덕션 tier 기본값 — 커밋에 박제된 고정값. 프로덕션에서는 LLM_MODEL_* env를
// 코드 레벨에서 무시하고 이 값을 강제한다(resolveTierModelIds). Railway env를 실수로
// 잘못 넣어도 프로덕션 동작이 안 흔들리게 하는 하드 lock의 앵커다.
export const DEFAULT_STANDARD_MODEL = "gpt-5";
export const DEFAULT_MINI_MODEL = "gpt-5-mini";
export const DEFAULT_NANO_MODEL = "gpt-5-nano";

// 비프로덕션(로컬·스테이징) tier 기본값 — 저렴한 Google 모델. env override 미설정 시 적용해
// 슬라이스마다 "비용 태우는 거 아닌가"를 다시 확인하지 않아도 되게 한다. 프로바이더 키가 없으면
// providers.ts가 커밋된 OpenAI 기본값으로 폴백한다(부팅 보호) — 키 없는 환경도 그대로 뜬다.
export const NONPROD_DEFAULT_STANDARD_MODEL = "gemini-3.5-flash";
export const NONPROD_DEFAULT_MINI_MODEL = "gemini-3.1-flash-lite";
export const NONPROD_DEFAULT_NANO_MODEL = "gemini-3.1-flash-lite";

export interface TieredLlm {
  readonly standard: LlmProvider;
  readonly mini: LlmProvider;
  readonly nano: LlmProvider;
}

export interface TierModelIds {
  standard: string;
  mini: string;
  nano: string;
}

// tier별 실제 모델 id를 해석한다. 동작별 tier 매핑은 docs/guides/llm-model-map.md 참고.
//  - 프로덕션 하드 lock: APP_ENV === "production"이면 env override(LLM_MODEL_*)를 코드 레벨에서
//    무시하고 커밋된 OpenAI 기본값을 강제한다. env 신뢰만으로 두지 않는 방어층이다.
//  - 비프로덕션: env override → 저렴한 Google 기본값 순으로 해석. 프로바이더 키 유무는 여기서
//    보지 않는다 — 부팅 보호 폴백은 키를 아는 providers.ts가 맡는다(관심사 분리).
export function resolveTierModelIds(args: {
  appEnv: AppEnv;
  standard?: string;
  mini?: string;
  nano?: string;
}): TierModelIds {
  if (args.appEnv === "production") {
    return {
      standard: DEFAULT_STANDARD_MODEL,
      mini: DEFAULT_MINI_MODEL,
      nano: DEFAULT_NANO_MODEL,
    };
  }
  return {
    standard: args.standard ?? NONPROD_DEFAULT_STANDARD_MODEL,
    mini: args.mini ?? NONPROD_DEFAULT_MINI_MODEL,
    nano: args.nano ?? NONPROD_DEFAULT_NANO_MODEL,
  };
}

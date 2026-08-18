// ingestSource가 processing 중복을 만나거나 reExtractSource가 이미 진행 중인
// 재추출과 겹치면 던진다. source-service.ts가 아닌 별도 파일에 두는 이유:
// error-mapper.ts가 이 타입을 instanceof로 인식해야 하는데, source-service.ts를
// 통째로 import하면 trpc.ts(error-mapper.ts를 참조) → source-service.ts →
// trpc.ts로 순환 의존이 생긴다(request-origin.ts를 따로 뺀 것과 같은 사정).
export class SourceAlreadyProcessingError extends Error {
  constructor(public readonly sourceId: string) {
    super(`Source ${sourceId} is still processing.`);
    this.name = "SourceAlreadyProcessingError";
  }
}

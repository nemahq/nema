// 진행 중인 digestion 콜의 취소 전파 — DB가 "다시 집지 마라"까지 보증하고(cancel_source_digestion이
// digestion_status를 'cancelled'로 옮겨 워커 인출 쿼리에서 뺀다), 이 레지스트리가 "지금 떠 있는
// 콜을 끊어라"를 맡는다. 둘이 갈린 이유: DB 상태만으로는 이미 프로바이더에 나가 있는 HTTP 요청을
// 못 되돌린다 — 취소해도 그 콜은 끝까지 돌아 토큰을 태우고 결과를 버리게 된다.
//
// 프로세스 안의 Map으로 충분한 근거: 서버는 Railway 단일 인스턴스로 뜨고, digestion 콜을 띄우는
// 워커도 그 프로세스 안에 산다(index.ts가 createStatementSyncWorker를 직접 붙인다). 즉 "취소를 받는
// 곳"과 "콜이 떠 있는 곳"이 항상 같은 프로세스다. 인스턴스가 여럿이 되면 이 가정이 깨지는데, 그때도
// 정확성은 안 깨진다 — 다른 인스턴스의 콜을 못 끊을 뿐 DB 가드가 결과를 버리므로, 잃는 건 비용
// 절감뿐이다(그 시점엔 취소 신호를 pgmq로 브로드캐스트하면 된다).
const controllers = new Map<string, AbortController>();

export function registerDigestion(
  sourceId: string,
  controller: AbortController,
): void {
  controllers.set(sourceId, controller);
}

// 등록한 controller만 지운다. 같은 원문이 두 번 클레임될 수 있어서다: 리스는 150초인데
// 한 시도의 벽시계는 LLM 타임아웃(120초)만이 아니라 limitLlmCall의 큐 대기까지 더한
// 값이라, 동시 콜이 몰리면 리스를 넘길 수 있다. 그러면 워커가 같은 원문을 다시 집고,
// 옛 시도가 뒤늦게 정리하면서 새 시도의 controller를 지워버린다 — 그 시도는 취소가
// 영영 닿지 않는 유령이 된다. 자기 것만 지우면 옛 시도의 정리는 무해한 no-op이 된다.
export function unregisterDigestion(
  sourceId: string,
  controller: AbortController,
): void {
  if (controllers.get(sourceId) === controller) {
    controllers.delete(sourceId);
  }
}

// 떠 있는 콜이 없으면(아직 워커가 안 집었거나 이미 끝났음) 조용히 넘긴다 — 취소의 정본은
// DB이고 이건 비용 절감 경로라, 끊을 게 없다는 건 실패가 아니다.
export function abortDigestion(sourceId: string): void {
  controllers.get(sourceId)?.abort();
}

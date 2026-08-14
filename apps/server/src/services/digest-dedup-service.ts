import { getDigestDedupProvider } from "@server/infra/llm/provider";
import type { DedupDigest, Duplicate } from "@server/prompts/digest-dedup";
import {
  buildDigestDedupMessage,
  buildDigestDedupSystemPrompt,
  DigestDedupSchema,
} from "@server/prompts/digest-dedup";

// =============================================================
// 겹치는 카드 걸러내기 — 판정을 받아 무엇을 뺄지 정하고, 뺀 것을 목록으로 돌려준다.
//
// 이 단계는 부수적이다. 판정이 실패하면 제거를 건너뛰고 전부 돌려준다 — 이 단계가
// 없던 상태로 돌아갈 뿐이라 잃는 게 없다(색인과 갈리는 대목: 색인 실패는 조용한
// 유실이라 던지기 전체를 실패시킨다).
//
// 아래 검사들은 전부 한쪽으로만 기운다 — 판정이 이상하면 안 지운다. 잘못 지운 카드는
// 사용자가 그런 판단이 있었다는 사실조차 모른 채 사라지지만, 안 지운 카드는 겹쳐
// 보일 뿐이다.
// =============================================================

// 하나뿐이면 겹칠 상대가 없다 — 부르지 않는다.
const MIN_DIGESTS_TO_COMPARE = 2;

export interface DroppedDigest<T> {
  digest: T;
  containedIn: T;
  field: string;
  reason: string;
}

export interface DedupResult<T> {
  kept: T[];
  dropped: Array<DroppedDigest<T>>;
}

export async function dropContainedDigests<T extends DedupDigest>(
  digests: T[],
): Promise<DedupResult<T>> {
  if (digests.length < MIN_DIGESTS_TO_COMPARE) {
    return { kept: digests, dropped: [] };
  }

  const duplicates = await judgeDuplicates(digests);
  const removals = collectRemovals({ digests, duplicates });

  return {
    kept: digests.filter((_, index) => !removals.has(index)),
    dropped: [...removals.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, removal]) => ({
        digest: digests[index],
        containedIn: digests[removal.containedInIndex],
        field: removal.field,
        reason: removal.reason,
      })),
  };
}

async function judgeDuplicates(
  digests: readonly DedupDigest[],
): Promise<Duplicate[]> {
  try {
    const judged = await getDigestDedupProvider().generateStructured({
      systemPrompt: buildDigestDedupSystemPrompt(),
      messages: [{ role: "user", content: buildDigestDedupMessage(digests) }],
      schema: DigestDedupSchema,
    });
    return judged.duplicates;
  } catch (error: unknown) {
    console.warn(
      "[digest-dedup] 판정 실패 — 걸러내지 않고 전부 남긴다:",
      error,
    );
    return [];
  }
}

interface Removal {
  containedInIndex: number;
  field: string;
  reason: string;
}

function collectRemovals(args: {
  digests: readonly DedupDigest[];
  duplicates: readonly Duplicate[];
}): Map<number, Removal> {
  const { digests, duplicates } = args;
  const removals = new Map<number, Removal>();

  for (const duplicate of duplicates) {
    const index = duplicate.digest - 1;
    const containedInIndex = duplicate.containedIn - 1;

    if (!isInRange(index, digests) || !isInRange(containedInIndex, digests)) {
      console.warn(
        `[digest-dedup] 번호가 범위 밖 — digest=${duplicate.digest}, containedIn=${duplicate.containedIn}`,
      );
      continue;
    }
    // 자기 안에 자기가 들어 있다는 답은 무의미한데, 그대로 두면 카드가 이유 없이 사라진다.
    if (index === containedInIndex) {
      console.warn(
        `[digest-dedup] 자기 자신을 가리킴 — number=${duplicate.digest}`,
      );
      continue;
    }
    if (removals.has(index)) {
      console.warn(
        `[digest-dedup] 같은 카드를 두 번 뺌 — 처음 판정만 쓴다, number=${duplicate.digest}`,
      );
      continue;
    }

    removals.set(index, {
      containedInIndex,
      field: duplicate.field,
      reason: duplicate.reason,
    });
  }

  return dropRemovalsWithVanishingContainer(removals);
}

// 남기기로 한 쪽이 자기도 빠질 참이면 그 제거를 취소한다 — 그대로 두면 A의 내용이
// A를 담고 있던 B와 함께 사라져, 겹침을 지운 게 아니라 판단 하나를 통째로 잃는다.
// 서로를 가리키는 두 카드(A↔B)도 여기서 함께 산다.
//
// 한 번만 훑는다. 취소된 것까지 반영해 다시 돌리면 더 지울 수 있지만, 애매하면
// 남기는 쪽이 이 단계의 기본값이다.
function dropRemovalsWithVanishingContainer(
  removals: Map<number, Removal>,
): Map<number, Removal> {
  const candidates = new Set(removals.keys());

  for (const [index, removal] of removals) {
    if (!candidates.has(removal.containedInIndex)) {
      continue;
    }
    console.warn(
      `[digest-dedup] 담고 있다는 쪽도 빠질 참이라 제거를 취소함 — number=${index + 1}, containedIn=${removal.containedInIndex + 1}`,
    );
    removals.delete(index);
  }

  return removals;
}

function isInRange(index: number, digests: readonly unknown[]): boolean {
  return Number.isInteger(index) && index >= 0 && index < digests.length;
}

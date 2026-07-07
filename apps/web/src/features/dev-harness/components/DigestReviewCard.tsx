import { useState } from "react";

import { Button } from "@nema-io/weave";

import { useConfirmReview } from "@web/features/dev-harness/hooks/useConfirmReview";
import { useDigestReviewQuery } from "@web/features/dev-harness/hooks/useDigestReviewQuery";
import { useUpdateReview } from "@web/features/dev-harness/hooks/useUpdateReview";
import type { ReviewDigest } from "@web/features/dev-harness/types";
import { parseTopics } from "@web/features/dev-harness/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-surface-card px-2 py-1 text-sm text-fg-primary outline-none focus:border-border-strong";

// 편집 가능한 필드(제목·요약·주제)만 로컬 상태로 들고, 본문·태그·레퍼런스는 그대로 통과시킨다 —
// 하니스는 왕복(수정→확정)을 구동하는 게 목적이라 구조화 본문 편집은 제품 UI 몫으로 남긴다.
interface DigestEdit {
  title: string;
  description: string;
  topicsText: string;
}

function toEdit(digest: ReviewDigest): DigestEdit {
  return {
    title: digest.title,
    description: digest.description,
    topicsText: digest.topics.join(", "),
  };
}

interface DigestReviewCardProps {
  changesetId: string;
}

export function DigestReviewCard({ changesetId }: DigestReviewCardProps) {
  const reviewQuery = useDigestReviewQuery(changesetId);
  const updateReview = useUpdateReview(changesetId);
  const confirmReview = useConfirmReview();

  const [edits, setEdits] = useState<DigestEdit[] | null>(null);
  const pending = updateReview.isPending || confirmReview.isPending;
  const error = updateReview.error ?? confirmReview.error;

  if (reviewQuery.isError) {
    return (
      <p className="text-xs text-status-error">
        {getErrorMessage(reviewQuery.error)}
      </p>
    );
  }
  if (!reviewQuery.data) {
    return <p className="text-xs text-fg-tertiary">리뷰 불러오는 중…</p>;
  }

  const review = reviewQuery.data;
  // 서버가 준 초안을 편집 기준선으로 삼는다 — 저장/재조회로 데이터가 바뀌면 다시 맞춘다.
  const current = edits ?? review.digests.map(toEdit);

  function patch(index: number, field: keyof DigestEdit, value: string) {
    setEdits(
      current.map((edit, i) =>
        i === index ? { ...edit, [field]: value } : edit,
      ),
    );
  }

  function buildDigests() {
    return review.digests.map((digest, index) => ({
      ...digest,
      title: current[index].title.trim(),
      description: current[index].description.trim(),
      topics: parseTopics(current[index].topicsText),
    }));
  }

  function handleSave() {
    if (pending) {
      return;
    }
    updateReview.reset();
    confirmReview.reset();
    updateReview.mutate(
      {
        changesetId,
        digests: buildDigests(),
        newReferences: review.newReferences,
      },
      { onSuccess: () => setEdits(null) },
    );
  }

  async function handleConfirm() {
    if (pending) {
      return;
    }
    updateReview.reset();
    confirmReview.reset();
    try {
      // 편집한 내용을 먼저 반영한 뒤 확정한다 — 확정은 저장된 초안을 박제한다.
      if (edits) {
        await updateReview.mutateAsync({
          changesetId,
          digests: buildDigests(),
          newReferences: review.newReferences,
        });
        setEdits(null);
      }
      confirmReview.mutate({ changesetId });
    } catch {
      // 저장 실패 시 확정하지 않는다 — 에러는 updateReview.error로 노출된다.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-surface-raised p-3">
      <details>
        <summary className="cursor-pointer text-xs text-fg-tertiary">
          원문 보기
        </summary>
        <p className="mt-1 whitespace-pre-wrap text-xs text-fg-secondary">
          {review.sourceBody}
        </p>
      </details>

      {review.digests.map((digest, index) => {
        const bodyRows = bodyFieldRows(digest.body);
        return (
          <div
            key={index}
            className="flex flex-col gap-1 rounded-md border border-border/40 p-2"
          >
            <span className="text-[10px] uppercase text-fg-tertiary">
              {digest.body.type}
            </span>
            <input
              value={current[index].title}
              onChange={(e) => patch(index, "title", e.target.value)}
              placeholder="제목"
              className={INPUT_CLASS}
            />
            <input
              value={current[index].description}
              onChange={(e) => patch(index, "description", e.target.value)}
              placeholder="요약"
              className={INPUT_CLASS}
            />
            {/* 타입별 본문 필드는 읽기 전용 — 구조화 편집은 제품 UI 몫이라 값 확인만 한다. */}
            {bodyRows.length > 0 && (
              <dl className="flex flex-col gap-0.5 text-xs">
                {bodyRows.map(([key, value]) => (
                  <div key={key} className="flex gap-1">
                    <dt className="text-fg-tertiary">{key}</dt>
                    <dd className="text-fg-secondary">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <input
              value={current[index].topicsText}
              onChange={(e) => patch(index, "topicsText", e.target.value)}
              placeholder="주제 (쉼표로 구분)"
              className={INPUT_CLASS}
            />
            {digest.tags.length > 0 && (
              <span className="text-xs text-fg-tertiary">
                태그: {digest.tags.map((tag) => tag.title).join(", ")}
              </span>
            )}
          </div>
        );
      })}

      {review.newReferences.length > 0 && (
        <span className="text-xs text-fg-tertiary">
          새 레퍼런스:{" "}
          {review.newReferences.map((reference) => reference.title).join(", ")}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Button
          size="xs"
          variant="ghost"
          onClick={handleSave}
          disabled={!edits || pending}
        >
          저장
        </Button>
        <Button size="xs" onClick={handleConfirm} disabled={pending}>
          확정
        </Button>
      </div>

      {error && (
        <p className="text-xs text-status-error">{getErrorMessage(error)}</p>
      )}
    </div>
  );
}

// 판별자(type)를 뺀 본문 필드를 [키, 표시값] 행으로. 배열 값은 · 로 잇는다.
function bodyFieldRows(body: ReviewDigest["body"]): [string, string][] {
  return Object.entries(body)
    .filter(([key]) => key !== "type")
    .map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(" · ") : String(value),
    ]);
}

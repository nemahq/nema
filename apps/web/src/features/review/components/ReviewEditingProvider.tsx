import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";

import {
  createReviewEditingStore,
  type ReviewEditingStore,
  type ReviewEditingStoreState,
} from "@web/features/review/reviewEditingStore";
import type { DigestReviewDetail } from "@web/features/review/types";

const ReviewEditingContext = createContext<ReviewEditingStore | null>(null);

interface ReviewEditingProviderProps {
  review: DigestReviewDetail;
  children: ReactNode;
}

export function ReviewEditingProvider({
  review,
  children,
}: ReviewEditingProviderProps) {
  const [store] = useState(() => createReviewEditingStore(review));

  return <ReviewEditingContext value={store}>{children}</ReviewEditingContext>;
}

// selector를 받는 이유는 구독 범위를 좁히기 위해서다 — Context 값을 통째로 읽으면
// 어느 필드가 바뀌든 모든 소비자가 리렌더된다(Digest 카드가 늘어날수록 비용이 커짐).
export function useReviewEditing<T>(
  selector: (state: ReviewEditingStoreState) => T,
): T {
  const store = useContext(ReviewEditingContext);
  if (!store) {
    throw new Error(
      "useReviewEditing must be used within ReviewEditingProvider.",
    );
  }
  return useStore(store, selector);
}

import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";

import {
  createReviewEditingStore,
  type ReviewEditingStore,
  type ReviewEditingStoreState,
} from "@web/features/review/reviewEditingStore";

const ReviewEditingContext = createContext<ReviewEditingStore | null>(null);

interface ReviewEditingProviderProps {
  children: ReactNode;
}

export function ReviewEditingProvider({
  children,
}: ReviewEditingProviderProps) {
  const [store] = useState(createReviewEditingStore);

  return <ReviewEditingContext value={store}>{children}</ReviewEditingContext>;
}

// selector를 필수로 받아 구독 범위를 좁힌다. 지금은 소비자가 하나뿐이라 이점이
// 드러나지 않지만, 카드별 구독(후속 PR)은 이 형태를 전제로 한다.
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

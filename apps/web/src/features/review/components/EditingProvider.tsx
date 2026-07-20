import { createContext, type ReactNode, useContext, useState } from "react";
import { useStore } from "zustand";

import {
  createReviewEditingStore,
  type ReviewEditingStore,
  type ReviewEditingStoreState,
} from "@web/features/review/reviewEditingStore";

const EditingContext = createContext<ReviewEditingStore | null>(null);

interface EditingProviderProps {
  children: ReactNode;
}

export function EditingProvider({ children }: EditingProviderProps) {
  const [store] = useState(createReviewEditingStore);

  return <EditingContext value={store}>{children}</EditingContext>;
}

// selector를 필수로 받는다. 카드가 자기 index의 편집값만 구독할 수 있는 게 이 형태
// 덕이고, 그래서 다른 카드를 고쳐도 리렌더가 번지지 않는다.
export function useEditing<T>(
  selector: (state: ReviewEditingStoreState) => T,
): T {
  const store = useContext(EditingContext);
  if (!store) {
    throw new Error("useEditing must be used within EditingProvider.");
  }
  return useStore(store, selector);
}

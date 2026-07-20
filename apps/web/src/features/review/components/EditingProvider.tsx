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

// selector를 필수로 받아 구독 범위를 좁힌다. 지금은 소비자가 하나뿐이라 이점이
// 드러나지 않지만, 카드별 구독(후속 PR)은 이 형태를 전제로 한다.
export function useEditing<T>(
  selector: (state: ReviewEditingStoreState) => T,
): T {
  const store = useContext(EditingContext);
  if (!store) {
    throw new Error("useEditing must be used within EditingProvider.");
  }
  return useStore(store, selector);
}

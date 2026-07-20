import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

interface DraftEditingContextValue {
  editedDraftId: string | null;
  setEditedDraftId: (sourceId: string | null) => void;
}

const DraftEditingContext = createContext<DraftEditingContextValue | null>(
  null,
);

interface DraftEditingProviderProps {
  children: ReactNode;
}

// 상세 패널에서 아직 저장되지 않은 원문 편집이 있는지를 목록 카드가 알아야 한다
// (결과없음 아이콘의 근거가 "원문을 아직 안 고쳤다"라, 고치는 순간 카드에서도
// 떼야 한다).
//
// 편집 중인 원문 자체가 아니라 sourceId만 담는다 — 카드는 이 context를 구독하므로
// 값이 바뀌면 memo와 무관하게 리렌더된다. 원문을 담으면 키 입력마다 전체 카드가
// 다시 그려지지만, sourceId만 담으면 dirty가 뒤집힐 때(세션당 몇 번)로 끝난다.
// 즉 memo가 막아주는 게 아니라 변경 빈도 자체를 낮춘 것이므로, 여기에 자주 바뀌는
// 값을 더 얹으면 그 효과가 그대로 사라진다.
export function DraftEditingProvider({ children }: DraftEditingProviderProps) {
  const [editedDraftId, setEditedDraftId] = useState<string | null>(null);
  const draftEditing = useMemo(
    () => ({ editedDraftId, setEditedDraftId }),
    [editedDraftId],
  );

  return (
    <DraftEditingContext value={draftEditing}>{children}</DraftEditingContext>
  );
}

function useDraftEditing() {
  const ctx = useContext(DraftEditingContext);
  if (!ctx) {
    throw new Error(
      "useDraftEditing must be used within DraftEditingProvider.",
    );
  }
  return ctx;
}

export function useIsDraftEdited(sourceId: string) {
  return useDraftEditing().editedDraftId === sourceId;
}

export function useMarkDraftEdited() {
  return useDraftEditing().setEditedDraftId;
}

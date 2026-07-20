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
// 떼야 한다). 편집 중인 원문 자체가 아니라 sourceId만 공유해 키 입력마다가 아니라
// dirty가 뒤집힐 때만 값이 바뀌게 한다 — 카드 memo를 무력화하지 않기 위해서다.
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

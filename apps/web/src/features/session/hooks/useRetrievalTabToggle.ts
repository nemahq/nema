import { useContentTab } from "@web/features/session/contexts/ContentTabContext";

export function useRetrievalTabToggle(retrievalId: string | null) {
  const { openRetrievalTabs, openRetrievalTab, closeRetrievalTab, tabOrder } =
    useContentTab();

  const isTabOpen = retrievalId !== null && openRetrievalTabs.has(retrievalId);
  const tabIndex = isTabOpen
    ? tabOrder.indexOf(`retrieval-${retrievalId}`) + 1
    : 0;

  function toggleTab() {
    if (!retrievalId) {
      return;
    }
    if (isTabOpen) {
      closeRetrievalTab(retrievalId);
    } else {
      openRetrievalTab(retrievalId);
    }
  }

  return { isTabOpen, tabIndex, toggleTab };
}

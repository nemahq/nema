import { Button, Text } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import { SidePanel } from "@web/components/ui/SidePanel";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceDetailPanel } from "./ReferenceDetailPanel";
import { ReferenceList } from "./ReferenceList";

interface ReferenceListScreenProps {
  selectedReferenceId: string | null;
  onSelectReference: (referenceId: string | null) => void;
}

export function ReferenceListScreen({
  selectedReferenceId,
  onSelectReference,
}: ReferenceListScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-6 py-4">
        {/* LNB 항목과 같은 제품 용어("위키"/"Wiki") 재사용 — design-decisions-log.md
            "References → Wiki(en)/위키(ko)" 결정, 동의어를 새로 안 만든다. */}
        <Text as="h1" size="xl" weight="bold">
          {t("workspace.references")}
        </Text>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-4">
          <ReferenceList onSelectReference={onSelectReference} />
        </div>

        {selectedReferenceId && (
          <div className="relative flex">
            <SidePanel
              boundaryName="reference-detail-panel"
              onClose={() => onSelectReference(null)}
            >
              <ReferenceDetailPanel
                key={selectedReferenceId}
                referenceId={selectedReferenceId}
              />
            </SidePanel>
            {/* SidePanel의 ErrorBoundary 밖에 둔다 — reference.get이 죽은 링크·
                권한 없는 워크스페이스로 실패해도 항상 닫을 수 있어야 한다. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.close")}
              onClick={() => onSelectReference(null)}
              className="absolute top-2 right-2 z-10"
            >
              <X />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

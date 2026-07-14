import { useTranslation } from "@web/lib/tolgee";

interface SourceTextPanelProps {
  body: string;
}

export function SourceTextPanel({ body }: SourceTextPanelProps) {
  const { t } = useTranslation();

  return (
    <details
      open
      className="group rounded-lg border border-border/60 bg-surface-raised"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-fg-primary">
        {t("review.source_text_panel_title")}
      </summary>
      <p className="max-h-80 overflow-y-auto whitespace-pre-wrap border-t border-border/60 px-4 py-3 text-sm text-fg-secondary">
        {body}
      </p>
    </details>
  );
}

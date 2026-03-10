import { useTranslation } from "@web/lib/tolgee";

export function EmptyState({ variant }: { variant: number }) {
  const { t } = useTranslation();

  const headingKey =
    `session.empty_heading_${variant}` as `session.empty_heading_${number}`;
  const subheadingKey =
    `session.empty_subheading_${variant}` as `session.empty_subheading_${number}`;

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <h2 className="text-2xl font-semibold text-fg-primary">
        {t(headingKey)}
      </h2>
      <p className="text-sm text-fg-tertiary">{t(subheadingKey)}</p>
    </div>
  );
}

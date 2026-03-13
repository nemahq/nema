import { LoaderCircle } from "@nema-io/weave/icons";

export function ContentAreaSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-card">
      <LoaderCircle className="size-6 animate-spin text-fg-tertiary" />
    </div>
  );
}

import { Dialog, DialogContent } from "@nema-io/weave";

import { SpaceModalForm } from "./SpaceModalForm";

type SpaceModalProps =
  | {
      mode: "create";
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }
  | {
      mode: "rename";
      spaceId: string;
      spaceName: string;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    };

export function SpaceModal(props: SpaceModalProps) {
  const { open, onOpenChange } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open &&
          (props.mode === "create" ? (
            <SpaceModalForm mode="create" onOpenChange={onOpenChange} />
          ) : (
            <SpaceModalForm
              mode="rename"
              spaceId={props.spaceId}
              spaceName={props.spaceName}
              onOpenChange={onOpenChange}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

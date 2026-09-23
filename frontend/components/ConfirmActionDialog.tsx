import type { T } from "../uiTypes";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";

export function ConfirmActionDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
  t,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  t: T;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="confirm-action-dialog">
        <div className="dialog-head">
          <DialogTitle>{title}</DialogTitle>
          <DialogClose asChild disabled={busy}>
            <Button
              size="xs"
              type="button"
              variant="ghost"
              aria-label={t("close")}
            >
              ×
            </Button>
          </DialogClose>
        </div>
        <p>{message}</p>
        <div className="run-job-actions">
          <Button
            size="xs"
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("cancel")}
          </Button>
          <Button
            size="xs"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

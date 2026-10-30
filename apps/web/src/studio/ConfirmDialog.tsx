import { Button, Dialog } from '@gurukul/ui';
import type { ReactNode } from 'react';

/** "Are you sure?" for a delete: a Dialog with Cancel and a danger-worded confirm button. */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{children}</p>
    </Dialog>
  );
}

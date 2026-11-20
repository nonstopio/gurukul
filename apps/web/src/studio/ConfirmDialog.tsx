import { Button, Dialog } from '@gurukul/ui';
import type { ReactNode } from 'react';

/** "Are you sure?" for a delete (or a costly replace): a Dialog with Cancel and the confirm button. */
export function ConfirmDialog({
  title,
  confirmLabel,
  onConfirm,
  onClose,
  tone = 'danger',
  children,
}: {
  title: string;
  confirmLabel: string;
  /** `danger` throws work away (the default); `primary` replaces something, as Save to draft does. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      mascot="warning"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p>{children}</p>
    </Dialog>
  );
}

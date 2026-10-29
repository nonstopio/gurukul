import { Button, Callout } from '@gurukul/ui';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from './ConfirmDialog';
import type { DraftApi } from './useDraft';

/**
 * Stops in-app navigation while the draft has edits that are not on the server. A draft that is
 * only waiting for its autosave is saved first and the move goes ahead; one that cannot be saved
 * (offline, or someone else saved first) asks, and leaving keeps nothing but the local backup.
 */
export function LeaveGuard({ draft }: { draft: Pick<DraftApi, 'save' | 'saveNow'> }) {
  // Asked when a move starts, so a save that finishes (or starts) in between is not misjudged.
  const current = useRef(draft.save);
  useEffect(() => {
    current.current = draft.save;
  });
  const blocker = useBlocker(() => current.current !== 'saved' && current.current !== 'saving');
  const [asking, setAsking] = useState(false);
  const { state, proceed } = blocker;
  const { saveNow } = draft;
  useEffect(() => {
    if (state !== 'blocked') return;
    void saveNow().then((saved) => (saved ? proceed() : setAsking(true)));
  }, [state, proceed, saveNow]);
  if (state !== 'blocked' || !asking) return null;
  const stay = () => {
    setAsking(false);
    blocker.reset();
  };
  return (
    <ConfirmDialog
      title="Leave with unsaved changes?"
      confirmLabel="Leave without saving"
      onConfirm={() => {
        setAsking(false);
        proceed();
      }}
      onClose={stay}
    >
      Your latest edits could not be saved. Stay to try again.
    </ConfirmDialog>
  );
}

/** Offers back the edits that failed to save last time and were kept on this device. */
export function RestoreNotice({
  draft,
}: {
  draft: Pick<DraftApi, 'backupAt' | 'restoreBackup' | 'discardBackup'>;
}) {
  if (!draft.backupAt) return null;
  return (
    <Callout tone="warning" title="Unsaved edits from this device">
      <p>
        Edits you made on {draft.backupAt.toLocaleString()} could not be saved. Restore them to
        carry on, or discard them.
      </p>
      <Button variant="secondary" onClick={draft.restoreBackup}>
        Restore edits
      </Button>
      <Button variant="ghost" onClick={draft.discardBackup}>
        Discard
      </Button>
    </Callout>
  );
}

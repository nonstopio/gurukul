import { Button, Dialog, useToast } from '@gurukul/ui';
import { useEffect, useRef } from 'react';
import { useUpdate } from './update';

const reloadPage = () => window.location.reload();

/**
 * Tells a tab running an old build that a newer one is live. A soft update is a toast with Update
 * and Later; Later (or closing it) keeps it away until a still newer build goes live. A hard update
 * is a dialog that cannot be dismissed: `main.tsx` has already stopped Firestore and the API, so
 * the only way on is Update. Nothing reloads unless the person asks.
 */
export function UpdatePrompt({ reload = reloadPage }: { reload?: () => void }) {
  const update = useUpdate();
  const toast = useToast();
  // The live build the toast was shown for, and the toast, so one build is offered only once.
  const offered = useRef<{ id: string; toast: number } | undefined>(undefined);

  useEffect(() => {
    if (!update || update.id === offered.current?.id) return;
    if (offered.current) toast.dismiss(offered.current.toast);
    offered.current = {
      id: update.id,
      toast:
        update.kind === 'soft'
          ? toast.show('Update when it suits you; this page will not reload by itself.', {
              title: 'A new version of Gurukul is ready',
              duration: 0,
              action: { label: 'Update', onSelect: reload },
              secondaryAction: { label: 'Later', onSelect: () => {} },
            })
          : -1,
    };
  }, [update, toast, reload]);

  if (update?.kind !== 'hard') return null;
  return (
    <Dialog open title="Gurukul has been updated" footer={<Button onClick={reload}>Update</Button>}>
      <p>Update now to keep going.</p>
    </Dialog>
  );
}

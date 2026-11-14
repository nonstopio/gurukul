import { useEffect, useState } from 'react';
import { Button, Callout, Card, Dialog, GlobalLoader, useToast } from '@gurukul/ui';
import { toastError } from '../errors';
import { ConfirmDialog } from '../studio/ConfirmDialog';
import { EXAMPLES } from './examples';
import type { Example } from './examples';

/** How long the loading overlay demo holds the screen before it lifts by itself. */
export const OVERLAY_MS = 2000;

/**
 * Design system → Alerts: one button per alert Gurukul raises, each raising the real thing through
 * the app's own providers (the error toast goes through `toastError`, so it carries the code and
 * the Report issue link a real failure does), then the alerts that sit in the page.
 */
export function Alerts() {
  const toast = useToast();
  const [dialog, setDialog] = useState<'confirm' | 'update' | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), OVERLAY_MS);
    return () => clearTimeout(timer);
  }, [loading]);
  const Callouts = (EXAMPLES.Callout as Example).Example;
  const Explanations = (EXAMPLES.Explanation as Example).Example;

  return (
    <div className="ds-section">
      <p>
        Every alert the system can raise, live. The owl leads each one with the face for its moment;
        the words beside it say what happened. Each component&apos;s rule is on Components.
      </p>
      <Card title="Toasts">
        <p>Something just happened. Errors stay until closed; the others time out.</p>
        <div className="ds-examples">
          <Button
            variant="secondary"
            onClick={() => toast.show('Your progress is saved.', { tone: 'success' })}
          >
            Show success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show('Finish "What Git solves" to open the next lesson.', {
                title: 'The next lesson is locked',
                action: { label: 'Open lesson', onSelect: () => {} },
              })
            }
          >
            Show info toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show('Try again in a minute.', {
                tone: 'warning',
                title: 'Too many requests',
                code: 'API-RATE',
              })
            }
          >
            Show warning toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toastError(toast, new Error('Example failure'), 'The example did not save.', () =>
                toast.show('Trying again…'),
              )
            }
          >
            Show error toast
          </Button>
        </div>
      </Card>
      <Card title="Dialogs and overlays">
        <p>A question that needs an answer, or an operation that holds the screen.</p>
        <div className="ds-examples">
          <Button variant="secondary" onClick={() => setDialog('confirm')}>
            Show delete confirmation
          </Button>
          <Button variant="secondary" onClick={() => setDialog('update')}>
            Show update dialog
          </Button>
          <Button variant="secondary" onClick={() => setLoading(true)}>
            Show loading overlay
          </Button>
        </div>
        {dialog === 'confirm' ? (
          <ConfirmDialog
            title="Delete this lesson?"
            confirmLabel="Delete lesson"
            onConfirm={() => setDialog(null)}
            onClose={() => setDialog(null)}
          >
            “What Git solves” is removed from the draft.
          </ConfirmDialog>
        ) : null}
        <Dialog
          open={dialog === 'update'}
          title="Gurukul has been updated"
          mascot="new"
          footer={<Button onClick={() => setDialog(null)}>Close example</Button>}
        >
          <p>Update now to keep going. The real one is blocking: its only button reloads.</p>
        </Dialog>
        {loading ? (
          <GlobalLoader variant="overlay" label="Example: assigning to 12 people" />
        ) : null}
      </Card>
      <Card title="In the page">
        <p>
          Callouts say something true about a region; a failed load is a warning with Retry. Feature
          tips appear by themselves on the page they teach, once per person.
        </p>
        <div className="ds-stack">
          <Callout tone="warning" mascot="error" title="This did not load">
            <p>Check your connection and try again.</p>
            <Button variant="secondary">Retry</Button>
          </Callout>
          <Callouts />
        </div>
      </Card>
      <Card title="Answer feedback">
        <p>A wrong answer gets the owl&apos;s encouraging wink, never a sad face.</p>
        <Explanations />
      </Card>
    </div>
  );
}

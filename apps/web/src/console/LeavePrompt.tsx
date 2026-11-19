import { useLayoutEffect } from 'react';
import { useBlocker } from 'react-router';
import { ConfirmDialog } from '../studio/ConfirmDialog';

/**
 * Asks before the person leaves a page that holds input nothing has saved: a link, Back or search
 * result inside the app (the router's blocker) and a refresh or closed tab (`beforeunload`).
 * Nothing is kept anywhere; the input may be personal data, so the answer is only to ask.
 */
export function LeavePrompt({
  when,
  title,
  children,
}: {
  when: boolean;
  title: string;
  children: string;
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );
  // A layout effect, so the tab-close warning switches in the same commit that draws the page:
  // after a page shows "assigned", closing the tab must not still ask.
  useLayoutEffect(() => {
    if (!when) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);
  if (blocker.state !== 'blocked') return null;
  return (
    <ConfirmDialog
      title={title}
      confirmLabel="Leave"
      onConfirm={blocker.proceed}
      onClose={blocker.reset}
    >
      {children}
    </ConfirmDialog>
  );
}

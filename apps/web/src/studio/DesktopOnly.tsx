import { EmptyState, Page, PageHeader, PenIcon, buttonClass } from '@gurukul/ui';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTerms } from '../labels/useTerms';

/**
 * Studio's minimum width (`.plan/08-studio.md`): the design system's small breakpoint. A tablet in
 * portrait and half of a laptop screen are wider; a phone is not.
 */
const WIDE_ENOUGH = '(min-width: 40rem)';

const query = () =>
  typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_ENOUGH) : null;

const subscribe = (notify: () => void) => {
  const q = query();
  q?.addEventListener('change', notify);
  return () => q?.removeEventListener('change', notify);
};

/** Without `matchMedia` (old browsers, tests) the page is shown, never blocked. */
const isWideEnough = () => query()?.matches ?? true;

/**
 * Studio works from 640px up: below that it says so instead of squeezing the editors. A
 * phone-sized Studio comes later; remove this gate then.
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  const t = useTerms();
  const wide = useSyncExternalStore(subscribe, isWideEnough);
  if (wide) return children;
  return (
    <Page width="reading">
      <PageHeader title={`${t.Studio} needs a bigger canvas`} />
      <EmptyState
        title="Great courses are not built on a small screen"
        headingAs="h2"
        icon={<PenIcon size={24} />}
        action={
          <Link className={buttonClass('secondary')} to="/">
            Back to Home
          </Link>
        }
      >
        Building a course takes room to think. Make this window wider, or open {t.Studio} on a
        tablet or laptop.
      </EmptyState>
    </Page>
  );
}

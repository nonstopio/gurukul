import { EmptyState, Page, PageHeader, PenIcon, buttonClass } from '@gurukul/ui';
import { useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTerms } from '../labels/useTerms';

/** The same breakpoint the app shell uses for its sidebar. */
const DESKTOP = '(min-width: 64rem)';

const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP) : null);

const subscribe = (notify: () => void) => {
  const q = query();
  q?.addEventListener('change', notify);
  return () => q?.removeEventListener('change', notify);
};

/** Without `matchMedia` (old browsers, tests) the page is shown, never blocked. */
const isDesktop = () => query()?.matches ?? true;

/**
 * Studio is for a wide screen: below the desktop breakpoint it says so instead of squeezing the
 * editors. A phone-sized Studio comes later; remove this gate then.
 */
export function DesktopOnly({ children }: { children: ReactNode }) {
  const t = useTerms();
  const desktop = useSyncExternalStore(subscribe, isDesktop);
  if (desktop) return children;
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
        Building a course takes room to think. Open {t.Studio} on a laptop or desktop.
      </EmptyState>
    </Page>
  );
}

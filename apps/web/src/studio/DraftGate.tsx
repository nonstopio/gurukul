import { buttonClass, EmptyState } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Loadable } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import type { DraftApi } from './useDraft';
import type { Working } from './types';

/** Loading, load-failed and no-draft states shared by the editors; renders `children` once the draft is ready. */
export function DraftGate({
  draft,
  children,
}: {
  draft: Pick<DraftApi, 'status' | 'work'>;
  children: (work: Working) => ReactNode;
}) {
  if (draft.status === 'missing') {
    return (
      <EmptyState
        headingAs="h2"
        title="This course has no draft you can edit"
        action={
          <Link className={buttonClass('secondary')} to="/studio">
            Back to your courses
          </Link>
        }
      >
        It may not exist, or you may not be one of its Acharyas.
      </EmptyState>
    );
  }
  const loadable: Loadable<Working> =
    draft.status === 'error'
      ? { state: 'error', error: new Error('The draft could not be loaded.') }
      : draft.status === 'ready'
        ? { state: 'ready', value: draft.work as Working }
        : { state: 'loading' };
  return <Loaded loadable={loadable}>{children}</Loaded>;
}

import type { Role } from '@gurukul/schema';
import type { ReactNode } from 'react';
import { NotAllowedPage } from './NotAllowedPage';
import { useSession } from './AuthProvider';

/**
 * Gates a route group by role; any listed role is enough. A person without one sees the
 * not-allowed page instead of a silent redirect. UI only: Firestore rules are the enforcement.
 */
export function RequireRole({ any, children }: { any: readonly Role[]; children: ReactNode }) {
  const { roles } = useSession();
  return any.some((r) => roles.includes(r)) ? children : <NotAllowedPage />;
}

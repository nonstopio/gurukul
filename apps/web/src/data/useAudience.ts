import type { Audience } from '@gurukul/schema';
import { useMemo } from 'react';
import { useSession } from '../auth/AuthProvider';

/**
 * Who is asking, for `listCourses`. Without it a listing returns public courses only, so a course
 * open to the person's team (or to staff) would be missing from every screen that forgot to ask.
 */
export function useAudience(): Audience {
  const { roles, teamIds } = useSession();
  const staff = roles.includes('educator') || roles.includes('admin');
  const teamKey = teamIds.join(',');
  return useMemo(() => ({ teamIds: teamKey.split(',').filter(Boolean), staff }), [teamKey, staff]);
}

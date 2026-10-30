import type { Person } from '@gurukul/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerms } from '../labels/useTerms';
import type { ConsoleData, UserRow } from './types';

/** How long typing must pause before a lookup reads, so a name typed quickly costs one query. */
const PAUSE_MS = 250;

/** How many people show when the field is focused and nothing is typed. */
export const FIRST_PEOPLE = 10;

/**
 * What a `PeoplePicker` needs to find people: `search`, `total` (the number of people who have
 * signed in) and `userOf` (the profile of someone `search` answered). Focus with nothing typed answers the first ten people; from the first character on it
 * answers those whose email or any word of the name starts with the text, after a pause. A call answers only if no
 * newer call arrived during the pause; the picker ignores an older answer anyway, so those resolve
 * to nothing without reading.
 */
export function usePeopleLookup(
  data: Pick<ConsoleData, 'searchUsers' | 'usersPage' | 'userCount'>,
) {
  const t = useTerms();
  const latest = useRef(0);
  const [total, setTotal] = useState<number | undefined>(undefined);
  // Every person answered so far, by email, for a caller that needs the whole profile of the one picked.
  const seen = useRef(new Map<string, UserRow>());
  useEffect(() => {
    let live = true;
    data.userCount().then(
      (n) => live && setTotal(n),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [data]);
  const toPerson = useCallback(
    (u: UserRow): Person => {
      seen.current.set(u.email, u);
      const tone = u.roles.includes('admin')
        ? 'admin'
        : u.roles.includes('educator')
          ? 'educator'
          : 'learner';
      return {
        email: u.email,
        name: u.displayName || undefined,
        photoUrl: u.photoURL,
        role: { admin: t.Admin, educator: t.Educator, learner: t.Learner }[tone],
        tone,
      };
    },
    [t],
  );
  const search = useCallback(
    async (text: string): Promise<Person[]> => {
      const mine = ++latest.current;
      const prefix = text.trim().toLowerCase();
      if (!prefix) return (await data.usersPage(null, FIRST_PEOPLE)).rows.map(toPerson);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      if (mine !== latest.current) return [];
      return (await data.searchUsers(prefix)).map(toPerson);
    },
    [data, toPerson],
  );
  const userOf = useCallback((email: string) => seen.current.get(email), []);
  return { search, total, userOf };
}

import type { Person } from '@gurukul/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTerms } from '../labels/useTerms';
import { searchPrefix } from './model';
import type { ConsoleData, UserRow } from './types';

/**
 * A "find a person" box: the text typed and the people whose email or name starts with it (from
 * two characters on). Each keystroke starts a search; only the newest one's answer is shown, so a
 * slow early response can never replace the results for what is typed now.
 */
export function usePeopleSearch(data: Pick<ConsoleData, 'searchUsers'>) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<UserRow[]>([]);
  const latest = useRef(0);
  const search = async (text: string) => {
    setQuery(text);
    const id = ++latest.current;
    const prefix = searchPrefix(text);
    const rows = prefix ? await data.searchUsers(prefix) : [];
    if (id === latest.current) setFound(rows);
  };
  return { query, found, search };
}

/** How long typing must pause before a lookup reads, so a name typed quickly costs one query. */
const PAUSE_MS = 250;

/** How many people show when the field is focused and nothing is typed. */
export const FIRST_PEOPLE = 10;

/**
 * What a `PeoplePicker` needs to find people: `search`, and `total`, the number of people who have
 * signed in. Focus with nothing typed answers the first ten people; from two characters on it
 * answers those whose email or name starts with the text, after a pause. A call answers only if no
 * newer call arrived during the pause; the picker ignores an older answer anyway, so those resolve
 * to nothing without reading.
 */
export function usePeopleLookup(
  data: Pick<ConsoleData, 'searchUsers' | 'usersPage' | 'userCount'>,
) {
  const t = useTerms();
  const latest = useRef(0);
  const [total, setTotal] = useState<number | undefined>(undefined);
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
      if (!text.trim()) return (await data.usersPage(null, FIRST_PEOPLE)).rows.map(toPerson);
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      const prefix = searchPrefix(text);
      if (mine !== latest.current || !prefix) return [];
      return (await data.searchUsers(prefix)).map(toPerson);
    },
    [data, toPerson],
  );
  return { search, total };
}

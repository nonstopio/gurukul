import type { Person } from '@gurukul/ui';
import { useCallback, useRef, useState } from 'react';
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

/**
 * The `search` a `PeoplePicker` takes: people whose email or name starts with the text (from two
 * characters), shown with their role. A call answers only if no newer call arrived during the
 * pause; the picker ignores an older answer anyway, so those resolve to nothing without reading.
 */
export function usePeopleLookup(data: Pick<ConsoleData, 'searchUsers'>) {
  const t = useTerms();
  const latest = useRef(0);
  return useCallback(
    async (text: string): Promise<Person[]> => {
      const mine = ++latest.current;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      const prefix = searchPrefix(text);
      if (mine !== latest.current || !prefix) return [];
      return (await data.searchUsers(prefix)).map((u) => {
        const tone = u.roles.includes('admin')
          ? 'admin'
          : u.roles.includes('educator')
            ? 'educator'
            : 'learner';
        return {
          email: u.email,
          name: u.displayName || undefined,
          role: { admin: t.Admin, educator: t.Educator, learner: t.Learner }[tone],
          tone,
        };
      });
    },
    [data, t],
  );
}

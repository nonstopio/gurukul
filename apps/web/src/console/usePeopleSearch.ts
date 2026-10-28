import { useRef, useState } from 'react';
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

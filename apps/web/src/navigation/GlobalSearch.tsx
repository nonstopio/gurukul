// Global search — one palette and one ⌘K / Ctrl-K listener for the whole app.
//
// Mounted once, in App, around every page. The header's SearchTrigger opens the same palette
// through context. Destinations come from the per-area metadata in `areas/*.ts`, filtered to what
// this person can open BEFORE matching, so nothing inaccessible is ever ranked or shown.

import { CommandPalette } from '@gurukul/ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { destinationsFor } from './catalog';
import { AREAS } from './index';
import { indexDestinations, searchDestinations } from './search';
import type { AreaNavigation, Destination, Role } from './types';

interface GlobalSearchValue {
  open: boolean;
  openSearch: () => void;
  shortcut: string;
}

const Ctx = createContext<GlobalSearchValue | null>(null);

/** `{ open, openSearch, shortcut }`, or null outside the provider. */
export function useGlobalSearch(): GlobalSearchValue | null {
  return useContext(Ctx);
}

export const isMac = (nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator) =>
  /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent);

export interface GlobalSearchProviderProps {
  children: ReactNode;
  navigate: (path: string) => void;
  /** The signed-in person's roles. Until sign-in lands (M1) everyone is a Shishya. */
  roles?: readonly Role[];
  areas?: readonly AreaNavigation[];
  mac?: boolean;
}

export function GlobalSearchProvider({
  children,
  navigate,
  roles = ['shishya'],
  areas = AREAS,
  mac = isMac(),
}: GlobalSearchProviderProps) {
  const [open, setOpen] = useState(false);
  const index = useMemo(() => indexDestinations(destinationsFor(areas, roles)), [areas, roles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `code` as well as `key`: on a Cyrillic or Greek layout the K key types another letter.
      // Some keydowns carry no `key` at all (browser autofill), so it is not assumed to be a string.
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      if ((key !== 'k' && e.code !== 'KeyK') || e.altKey || e.shiftKey) return;
      if (!(mac ? e.metaKey : e.ctrlKey)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mac]);

  const close = useCallback(() => setOpen(false), []);
  const openSearch = useCallback(() => setOpen(true), []);
  const search = useCallback(
    (query: string) =>
      searchDestinations(index, query).map((d: Destination) => ({
        id: d.id,
        label: d.label,
        sub: [d.areaName, d.description].filter(Boolean).join(' · '),
        kind: 'Page',
        value: d.path,
      })),
    [index],
  );
  const select = useCallback(
    (item: { value: string }) => {
      setOpen(false);
      navigate(item.value);
    },
    [navigate],
  );
  const value = useMemo(
    () => ({ open, openSearch, shortcut: mac ? '⌘K' : 'Ctrl K' }),
    [open, openSearch, mac],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <CommandPalette
        open={open}
        onClose={close}
        search={search}
        onSelect={select}
        label="Search Gurukul"
        placeholder="Search pages…"
        emptyText="No pages match"
      />
    </Ctx.Provider>
  );
}

/** The header control: a labelled, field-shaped button that opens the palette. */
export function SearchTrigger() {
  const search = useGlobalSearch();
  if (!search) return null;
  return (
    <button
      type="button"
      className="search-trigger"
      onClick={search.openSearch}
      aria-haspopup="dialog"
      aria-expanded={search.open}
      aria-keyshortcuts={search.shortcut === '⌘K' ? 'Meta+K' : 'Control+K'}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
      <span>Search</span>
      <kbd aria-hidden="true">{search.shortcut}</kbd>
    </button>
  );
}

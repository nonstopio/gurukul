import { NavItem, Sidebar, SidebarGroup, Button } from '@gurukul/ui';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { LinkProps } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useConsole } from './console/ConsoleProvider';
import { useLearnerData } from './data/DataProvider';
import { PageLoading } from './learn/ui';
import { OfflineBanner } from './OfflineBanner';
import { focusPageOnArrival, pageStart } from './routeFocus';
import { AREAS, destinationsFor } from './navigation';
import { GlobalSearchProvider, SearchTrigger } from './navigation/GlobalSearch';
import { courseSource, peopleLookup } from './navigation/records';
import type { AreaNavigation, Destination } from './navigation';

/** "Changelog · Gurukul": the page's label from its area's navigation, so the two never drift. */
export function titleFor(path: string, areas: readonly AreaNavigation[] = AREAS): string {
  const target = path.replace(/\/+$/, '') || '/';
  const page = areas.flatMap((a) => a.pages).find((p) => p.path === target);
  if (!page) return 'Gurukul · NonStop Academy';
  return page.path === '/' ? 'Gurukul · NonStop Academy' : `${page.label} · Gurukul`;
}

/** Groups what this person can open by area, in catalog order. */
export function groupByArea(destinations: readonly Destination[]): [string, Destination[]][] {
  const groups = new Map<string, Destination[]>();
  for (const d of destinations) groups.set(d.areaName, [...(groups.get(d.areaName) ?? []), d]);
  return [...groups];
}

/**
 * What every signed-in page shares, whichever layout it uses: global search, the document title,
 * "Skip to content", and focus moving to the new page's `h1` (announced) after each navigation.
 * It sits above both layouts, so moving from the outline into a lesson still counts as a navigation.
 */
export function Frame({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles } = useSession();
  const data = useLearnerData();
  // Courses and lessons in search, from the catalogue's own query, made only once search opens.
  const sources = useMemo(() => [courseSource(data)], [data]);
  // People for Kulapatis, by the Learners page's own prefix search, as they type.
  const { data: consoleData } = useConsole();
  const lookups = useMemo(() => [peopleLookup(consoleData)], [consoleData]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname, areas);
  }, [pathname, areas]);
  const root = useRef<HTMLDivElement>(null);
  const arrived = useRef(false);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    // The first page is announced by the browser itself; only later navigations move focus.
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    return focusPageOnArrival(root.current as HTMLDivElement, setAnnouncement);
  }, [pathname]);

  return (
    <GlobalSearchProvider
      navigate={(p) => void navigate(p)}
      roles={roles}
      areas={areas}
      sources={sources}
      lookups={lookups}
    >
      <a
        className="skip-link"
        href="#content"
        onClick={(e) => {
          e.preventDefault();
          pageStart(root.current as HTMLDivElement)?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div ref={root}>
        <Outlet />
      </div>
    </GlobalSearchProvider>
  );
}

/**
 * The sidebar layout: the sidebar (generated from the same navigation metadata as search, filtered
 * to the session's roles), the search trigger, and the routed page.
 */
export function Shell({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles, signOut } = useSession();
  const user = useUser();
  const { pathname } = useLocation();
  const groups = useMemo(() => groupByArea(destinationsFor(areas, roles)), [areas, roles]);

  return (
    <div className="app">
      <Sidebar
        label="Main"
        brand={<span className="app__brand">Gurukul</span>}
        footer={
          <div className="app__user">
            <span>{user.displayName ?? user.email}</span>
            <Button variant="chrome" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        }
      >
        {groups.map(([name, pages]) => (
          <SidebarGroup key={name} label={name}>
            {pages.map((p) => (
              <NavItem
                key={p.id}
                href={p.path}
                current={(pathname.replace(/\/+$/, '') || '/') === p.path}
                render={(props) => <Link to={p.path} {...(props as Omit<LinkProps, 'to'>)} />}
              >
                {p.label}
              </NavItem>
            ))}
          </SidebarGroup>
        ))}
      </Sidebar>
      <div className="app__content" id="content">
        <div className="app__bar">
          <SearchTrigger />
        </div>
        <OfflineBanner />
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * The focused layout for the lesson, Pariksha and result: no sidebar, so the page's own dark
 * `TopBar` (back link, course title, progress) is the only chrome. Search stays on Ctrl K / ⌘K.
 */
export function FocusedShell() {
  return (
    <div className="focused" id="content">
      <OfflineBanner />
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

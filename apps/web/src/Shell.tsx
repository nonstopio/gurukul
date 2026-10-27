import { NavItem, Sidebar, SidebarGroup, Button } from '@gurukul/ui';
import { Suspense, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { LinkProps } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { PageLoading } from './learn/ui';
import { AREAS, destinationsFor } from './navigation';
import { GlobalSearchProvider, SearchTrigger } from './navigation/GlobalSearch';
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
 * Signed-in chrome: the sidebar (generated from the same navigation metadata as search, filtered
 * to the session's roles), the search trigger, and the routed page.
 */
export function Shell({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles, signOut } = useSession();
  const user = useUser();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const groups = useMemo(() => groupByArea(destinationsFor(areas, roles)), [areas, roles]);
  useEffect(() => {
    document.title = titleFor(pathname, areas);
  }, [pathname, areas]);

  return (
    <GlobalSearchProvider navigate={(p) => void navigate(p)} roles={roles} areas={areas}>
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
        <div className="app__content">
          <div className="app__bar">
            <SearchTrigger />
          </div>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </GlobalSearchProvider>
  );
}

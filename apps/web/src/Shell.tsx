import {
  AppShell,
  AreaSwitcher,
  AwardIcon,
  ChartIcon,
  ChecklistIcon,
  ClockIcon,
  CodeIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  LanguagesIcon,
  LogOutIcon,
  MoonIcon,
  NavItem,
  PenIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  Sidebar,
  SidebarGroup,
  SparkIcon,
  SunIcon,
  UserCard,
  UserIcon,
  UsersIcon,
} from '@gurukul/ui';
import type { AvatarTone } from '@gurukul/ui';
import type { LabelSet, Role } from '@gurukul/schema';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import type { LinkProps } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useConsole } from './console/ConsoleProvider';
import { useLearnerData } from './data/DataProvider';
import { PageLoading } from './learn/ui';
import { useSaveLabels } from './labels/LabelChoice';
import { terms } from './labels/terms';
import type { Terms } from './labels/terms';
import { useTerms } from './labels/useTerms';
import { OfflineBanner } from './OfflineBanner';
import { focusPageOnArrival, pageStart } from './routeFocus';
import { AREAS, destinationsFor } from './navigation';
import { GlobalSearchProvider, SearchTrigger } from './navigation/GlobalSearch';
import { localize, localizePage } from './navigation/localize';
import { courseSource, editableCourseSource, peopleLookup } from './navigation/records';
import { ShortcutsDialog } from './ShortcutsDialog';
import { useStudio } from './studio/StudioProvider';
import { nextTheme, useTheme } from './theme';
import type { AreaNavigation, Destination } from './navigation';

/** "Changelog · Gurukul": the page's label from its area's navigation, so the two never drift. */
export function titleFor(
  path: string,
  areas: readonly AreaNavigation[] = AREAS,
  t: Terms = terms('generic'),
): string {
  const target = path.replace(/\/+$/, '') || '/';
  const page = areas.flatMap((a) => a.pages).find((p) => p.path === target);
  if (!page) return 'Gurukul · NonStop Academy';
  return page.path === '/' ? 'Gurukul · NonStop Academy' : `${localize(page.label, t)} · Gurukul`;
}

/** Groups what this person can open by area, in catalog order. */
export function groupByArea(destinations: readonly Destination[]): [string, Destination[]][] {
  const groups = new Map<string, Destination[]>();
  for (const d of destinations) groups.set(d.areaName, [...(groups.get(d.areaName) ?? []), d]);
  return [...groups];
}

export type AreaKey = 'learn' | 'studio' | 'admin';

/** The area a route belongs to, by its first segment: what the switcher highlights. */
export function areaKeyOf(path: string): AreaKey {
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';
  return path === '/studio' || path.startsWith('/studio/') ? 'studio' : 'learn';
}

/**
 * What every signed-in page shares, whichever layout it uses: global search, the document title,
 * "Skip to content", and focus moving to the new page's `h1` (announced) after each navigation.
 * It sits above both layouts, so moving from the outline into a lesson still counts as a navigation.
 */
export function Frame({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles } = useSession();
  const { uid } = useUser();
  const data = useLearnerData();
  const { data: studioData } = useStudio();
  const admin = roles.includes('admin');
  // Courses and lessons in search, from the catalogue's own query, made only once search opens;
  // for Educators and Admins also the courses they may edit, from Studio's own list.
  const t = useTerms();
  const sources = useMemo(
    () => [courseSource(data), editableCourseSource(studioData, uid, admin, t)],
    [data, studioData, uid, admin, t],
  );
  // People for Admins, by the Learners page's own prefix search, as they type.
  const { data: consoleData } = useConsole();
  const lookups = useMemo(() => [peopleLookup(consoleData, t)], [consoleData, t]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleFor(pathname, areas, t);
  }, [pathname, areas, t]);
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
      <ShortcutsDialog />
    </GlobalSearchProvider>
  );
}

const THEME_LABEL = { system: 'System', light: 'Light', dark: 'Dark' } as const;

/** The sidebar icon for each page, by its navigation id. A page without one shows none. */
const NAV_ICONS: Readonly<Record<string, ComponentType>> = {
  home: HomeIcon,
  catalogue: GridIcon,
  certificates: AwardIcon,
  profile: UserIcon,
  changelog: SparkIcon,
  'admin-overview': ChartIcon,
  'admin-learners': UsersIcon,
  'admin-assign': SendIcon,
  'admin-roles': ShieldIcon,
  'admin-audit': ClockIcon,
  'admin-design-system': CodeIcon,
  'admin-settings': SettingsIcon,
  'studio-courses': PenIcon,
  'studio-bank': ChecklistIcon,
  'studio-media': ImageIcon,
};

/** The sidebar icon for a page, by its navigation id; none for an id without one. */
export function navIcon(id: string): ReactNode {
  const Glyph = NAV_ICONS[id];
  return Glyph ? <Glyph /> : undefined;
}

/** The highest role picks the avatar's colour. */
export function topRole(roles: readonly Role[]): AvatarTone {
  if (roles.includes('admin')) return 'admin';
  return roles.includes('educator') ? 'educator' : 'learner';
}

/**
 * The sidebar layout: the sidebar (generated from the same navigation metadata as search, filtered
 * to the session's roles) with the person's card and account menu pinned at its foot, the search
 * bar, and the routed page inside the one `<main>`. `AppShell` keeps the sidebar on screen and
 * turns it into a drawer on narrow screens.
 */
export function Shell({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles, signOut, labels } = useSession();
  const user = useUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const saveLabels = useSaveLabels();
  const [theme, setTheme] = useTheme();
  const t = useTerms();
  const destinations = useMemo(
    () => destinationsFor(areas, roles).map((d) => localizePage(d, t)),
    [areas, roles, t],
  );
  const here = pathname.replace(/\/+$/, '') || '/';
  const area = areaKeyOf(here);
  // The areas this person may open, in Learn, Studio, Admin order, each starting at its first page.
  const switcher = (['learn', 'studio', 'admin'] as const).flatMap((key) => {
    const first = destinations.find((d) => areaKeyOf(d.path) === key);
    return first ? [{ key, first }] : [];
  });
  const groups = groupByArea(
    switcher.length > 1 ? destinations.filter((d) => areaKeyOf(d.path) === area) : destinations,
  );
  const areaName = { learn: 'Learn', studio: t.Studio, admin: t.Admin };
  const tone = topRole(roles);
  const nextLabels: LabelSet = labels === 'gurukul' ? 'generic' : 'gurukul';

  return (
    <AppShell
      navKey={pathname}
      bar={<SearchTrigger />}
      sidebar={
        <Sidebar
          label="Main"
          brand={
            <>
              <img src="/nonstop-logo.png" alt="NonStop io" height="26" className="app__logo" />
              <span className="app__brand">Gurukul</span>
            </>
          }
          switcher={
            switcher.length > 1 ? (
              <AreaSwitcher
                items={switcher.map(({ key, first }) => ({
                  id: key,
                  label: areaName[key],
                  href: first.path,
                  current: key === area,
                  render: (props) => <Link to={first.path} {...(props as Omit<LinkProps, 'to'>)} />,
                }))}
              />
            ) : undefined
          }
          footer={
            <UserCard
              roleLabel={{ admin: t.Admin, educator: t.Educator, learner: t.Learner }[tone]}
              name={user.displayName ?? String(user.email)}
              detail={String(user.email)}
              tone={tone}
              items={[
                { label: 'Profile', icon: <UserIcon />, onSelect: () => void navigate('/profile') },
                {
                  label: nextLabels === 'gurukul' ? 'Use Gurukul names' : 'Use plain English names',
                  icon: <LanguagesIcon />,
                  onSelect: () => void saveLabels(nextLabels),
                },
                {
                  label: 'Theme',
                  hint: THEME_LABEL[theme],
                  icon: theme === 'dark' ? <MoonIcon /> : <SunIcon />,
                  onSelect: () => setTheme(nextTheme(theme)),
                },
                {
                  label: "What's new",
                  icon: <SparkIcon />,
                  onSelect: () => void navigate('/changelog'),
                },
                { separator: true },
                {
                  label: 'Sign out',
                  icon: <LogOutIcon />,
                  danger: true,
                  onSelect: () => void signOut(),
                },
              ]}
            />
          }
        >
          {groups.map(([name, pages]) => (
            <SidebarGroup key={name} label={name}>
              {pages.map((p) => {
                return (
                  <NavItem
                    key={p.id}
                    href={p.path}
                    current={here === p.path}
                    icon={navIcon(p.id)}
                    render={(props) => <Link to={p.path} {...(props as Omit<LinkProps, 'to'>)} />}
                  >
                    {p.label}
                  </NavItem>
                );
              })}
            </SidebarGroup>
          ))}
        </Sidebar>
      }
    >
      <main id="content" className="app__main">
        <OfflineBanner />
        <Suspense fallback={<PageLoading />}>
          <div key={pathname} className="route-enter">
            <Outlet />
          </div>
        </Suspense>
      </main>
    </AppShell>
  );
}

/**
 * The focused layout for the lesson, Quiz, result and Studio editors: no sidebar, so the page's
 * own sticky dark `TopBar` (back link, title, progress or save state) is the only chrome. Search
 * stays on Ctrl K / ⌘K.
 */
export function FocusedShell() {
  return (
    <main className="focused" id="content">
      <OfflineBanner />
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </main>
  );
}

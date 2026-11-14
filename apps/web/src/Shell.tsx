import {
  AppShell,
  AreaSwitcher,
  AwardIcon,
  ChartIcon,
  ChecklistIcon,
  ClockIcon,
  CodeIcon,
  FileIcon,
  GridIcon,
  HomeIcon,
  ImageIcon,
  LanguagesIcon,
  LogOutIcon,
  NavItem,
  PenIcon,
  SendIcon,
  SettingsIcon,
  ShieldIcon,
  Sidebar,
  SidebarGroup,
  SparkIcon,
  UserCard,
  UserIcon,
  UsersIcon,
  TopBarToolsContext,
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
import { shownName } from './learn/model';
import { PageLoading } from './learn/ui';
import { useSaveLabels } from './labels/LabelChoice';
import { terms } from './labels/terms';
import type { Terms } from './labels/terms';
import { Logo } from './Logo';
import { useTerms } from './labels/useTerms';
import { OfflineBanner } from './OfflineBanner';
import { focusPageOnArrival, pageStart } from './routeFocus';
import { AREAS, destinationsFor } from './navigation';
import { GlobalSearchProvider, SearchTrigger } from './navigation/GlobalSearch';
import { localize, localizePage } from './navigation/localize';
import { courseSource, editableCourseSource, peopleLookup } from './navigation/records';
import { TrackClick } from './analytics/react/Track';
import { ShellFooter } from './ShellFooter';
import { ShortcutsDialog } from './ShortcutsDialog';
import { useStudio } from './studio/StudioProvider';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useTips } from './tips/useTips';
import type { AreaNavigation, Destination } from './navigation';

/** "Changelog · Gurukul": the page's label from its area's navigation, so the two never drift. */
export function titleFor(
  path: string,
  areas: readonly AreaNavigation[] = AREAS,
  t: Terms = terms('generic'),
): string {
  const target = path.replace(/\/+$/, '') || '/';
  const page = areas.flatMap((a) => a.pages).find((p) => p.path === target);
  if (!page || page.path === '/') return 'NonStop Gurukul';
  return `${localize(page.label, t)} · Gurukul`;
}

/** Groups what this person can open by area, in catalog order. */
export function groupByArea(destinations: readonly Destination[]): [string, Destination[]][] {
  const groups = new Map<string, Destination[]>();
  for (const d of destinations) groups.set(d.areaName, [...(groups.get(d.areaName) ?? []), d]);
  return [...groups];
}

export type AreaKey = 'learn' | 'studio' | 'team' | 'admin';

const AREA_KEYS: readonly AreaKey[] = ['learn', 'studio', 'team', 'admin'];

/** The area a route belongs to, by its first segment: what the switcher highlights. */
export function areaKeyOf(path: string): AreaKey {
  const first = path.split('/')[1] as AreaKey;
  return AREA_KEYS.includes(first) ? first : 'learn';
}

/**
 * What every signed-in page shares, whichever layout it uses: global search, the document title,
 * "Skip to content", and focus moving to the new page's `h1` (announced) after each navigation.
 * It sits above both layouts, so moving from the outline into a lesson still counts as a navigation.
 */
export function Frame({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles } = useSession();
  const { uid } = useUser();
  useTips(uid);
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
  'admin-emails': FileIcon,
  'admin-design-system': CodeIcon,
  'admin-settings': SettingsIcon,
  'studio-courses': PenIcon,
  'studio-teams': UsersIcon,
  'studio-bank': ChecklistIcon,
  'studio-media': ImageIcon,
  'team-teams': UsersIcon,
  'team-assign': SendIcon,
};

/** The sidebar icon for a page, by its navigation id; none for an id without one. */
export function navIcon(id: string): ReactNode {
  const Glyph = NAV_ICONS[id];
  return Glyph ? <Glyph /> : undefined;
}

/** The highest role picks the avatar's colour. A Manager has no colour of their own yet. */
export function topRole(roles: readonly Role[]): AvatarTone {
  if (roles.includes('admin')) return 'admin';
  return roles.includes('educator') ? 'educator' : 'learner';
}

/** The person's highest role by name, for the account menu: Admin, Educator, Manager, Learner. */
export function roleLabel(roles: readonly Role[], t: Terms): string {
  if (roles.includes('admin')) return t.Admin;
  if (roles.includes('educator')) return t.Educator;
  return roles.includes('manager') ? t.Manager : t.Learner;
}

/**
 * The sidebar layout: the sidebar (generated from the same navigation metadata as search, filtered
 * to the session's roles) with the person's card and account menu pinned at its foot, the search
 * bar, the routed page inside the one `<main>`, and the `ShellFooter` under it. `AppShell` keeps the
 * sidebar on screen and turns it into a drawer on narrow screens.
 */
export function Shell({ areas = AREAS }: { areas?: readonly AreaNavigation[] }) {
  const { roles, signOut, labels } = useSession();
  const user = useUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const saveLabels = useSaveLabels();
  const t = useTerms();
  const destinations = useMemo(
    () => destinationsFor(areas, roles).map((d) => localizePage(d, t)),
    [areas, roles, t],
  );
  const here = pathname.replace(/\/+$/, '') || '/';
  const area = areaKeyOf(here);
  // The areas this person may open, in Learn, Studio, Team, Admin order, each at its first page.
  const switcher = AREA_KEYS.flatMap((key) => {
    const first = destinations.find((d) => areaKeyOf(d.path) === key);
    return first ? [{ key, first }] : [];
  });
  // The changelog is reached from the account menu ("What's new"), not the sidebar.
  const navigable = destinations.filter((d) => d.id !== 'changelog');
  const groups = groupByArea(
    switcher.length > 1 ? navigable.filter((d) => areaKeyOf(d.path) === area) : navigable,
  );
  const areaName = { learn: 'Learn', studio: t.Studio, team: 'Team', admin: t.Admin };
  const tone = topRole(roles);
  const nextLabels: LabelSet = labels === 'gurukul' ? 'generic' : 'gurukul';

  return (
    <AppShell
      navKey={pathname}
      footer={<ShellFooter />}
      bar={
        <>
          <SearchTrigger />
          <ThemeSwitcher />
        </>
      }
      sidebar={
        <Sidebar
          label="Main"
          brand={
            <Link to="/" aria-label="Gurukul home" className="app__brand">
              <Logo className="app__logo" />
            </Link>
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
              roleLabel={roleLabel(roles, t)}
              name={shownName(user.displayName, String(user.email))}
              detail={String(user.email)}
              tone={tone}
              photoUrl={user.photoURL}
              items={[
                { label: 'Profile', icon: <UserIcon />, onSelect: () => void navigate('/profile') },
                {
                  label: nextLabels === 'gurukul' ? 'Use Gurukul names' : 'Use plain English names',
                  icon: <LanguagesIcon />,
                  onSelect: () => void saveLabels(nextLabels),
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
                    render={(props) => (
                      <TrackClick
                        event="select_content"
                        params={{ content_type: 'nav', content_id: p.id }}
                      >
                        <Link to={p.path} {...(props as Omit<LinkProps, 'to'>)} />
                      </TrackClick>
                    )}
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
    <TopBarToolsContext.Provider value={<ThemeSwitcher />}>
      <main className="focused" id="content">
        <OfflineBanner />
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
      </main>
    </TopBarToolsContext.Provider>
  );
}

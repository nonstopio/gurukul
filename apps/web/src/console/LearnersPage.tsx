import {
  Avatar,
  Button,
  Chip,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  Pagination,
  ProgressBar,
  Select,
  Tabs,
  useToast,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { teamId } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useAudience } from '../data/useAudience';
import { useDebounced } from '../data/useDebounced';
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { article } from '../labels/terms';
import { log } from '../log';
import { longDate } from '../quiz/model';
import { useConsole } from './ConsoleProvider';
import { LearnerDrawer } from './LearnerDrawer';
import {
  allPage,
  buildLearnerRows,
  filterPeople,
  isFiltered,
  mergeAssignments,
  onTab,
  peopleFromAssignments,
  searchPrefix,
  SEARCH_DELAY_MS,
  tabCounts,
} from './model';
import type { LearnerRow, LearnerTab, Person } from './model';
import type { AssignmentFull, UserPage, UserRow } from './types';

export const PAGE_SIZE = 25;
/** People per read when "Select all" walks the whole list. */
const SELECT_ALL_READ = 100;

/** The names of the teams a person is on, from the org's names, or a dash for none. */
const teamNames = (all: readonly string[], ids: readonly string[]): string =>
  all.filter((name) => ids.includes(teamId(name))).join(', ') || '—';

function tabItems(
  counts: Record<LearnerTab, number>,
  current: LearnerTab,
  table: ReactNode,
): [TabItem, ...TabItem[]] {
  const [first, ...rest] = TABS.map((t) => ({
    id: t.id,
    label: `${t.label} (${counts[t.id]})`,
    panel: t.id === current ? table : null,
  }));
  return [first as TabItem, ...rest];
}

const TABS: Array<{ id: LearnerTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'signedIn', label: 'Signed in' },
  { id: 'pending', label: 'Pending invite' },
  { id: 'overdue', label: 'Overdue' },
];

/** `/admin/learners`: everyone who signed in plus pending invites, with filters and bulk actions. */
export function LearnersPage() {
  const { data } = useConsole();
  const t = useTerms();
  const learner = useLearnerData();
  const audience = useAudience();
  const [now] = useState(() => new Date());
  const meta = useAsync(
    useCallback(async () => {
      const [newest, open, courses, teams, total] = await Promise.all([
        data.assignments(),
        data.openAssignments(now),
        learner.listCourses(audience),
        data.teams(),
        data.userCount(),
      ]);
      const assignments = mergeAssignments(newest, open);
      const people = peopleFromAssignments(assignments);
      const pending = onTab(people, 'pending', assignments, now);
      const counts: Record<LearnerTab, number> = {
        all: total + pending.length,
        signedIn: total,
        pending: pending.length,
        overdue: onTab(people, 'overdue', assignments, now).length,
      };
      return { assignments, courses, teams, total, people, pending, counts };
    }, [data, learner, audience, now]),
  );

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Admin}
        title={t.Learners}
        lead={`Everyone who has signed in, and the pending invites. Open a ${t.learner} for their courses, ${t.quizzes} and certificates.`}
      />
      <Loaded loadable={meta}>{(m) => <Learners meta={m} now={now} />}</Loaded>
    </Page>
  );
}

interface Meta {
  assignments: AssignmentFull[];
  courses: Course[];
  teams: string[];
  total: number;
  /** Everyone in the newest, pending and overdue assignments, and the pending invites among them. */
  people: Person[];
  pending: Person[];
  counts: Record<LearnerTab, number>;
}

/**
 * Filters stay mounted while rows reload, so typing is never interrupted. With no filter, "All"
 * and "Signed in" page through everyone from Firestore (pending invites follow on "All"); any
 * filter narrows to a bounded set that every other filter and the tab then apply to.
 */
function Learners({ meta, now }: { meta: Meta; now: Date }) {
  const { data, service } = useConsole();
  const terms = useTerms();
  const navigate = useNavigate();
  const toast = useToast();
  const me = useUser();
  const [changingRole, setChangingRole] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [tab, setTab] = useState<LearnerTab>('all');
  const [search, setSearch] = useState('');
  const query = useDebounced(search, SEARCH_DELAY_MS);
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [params, setParams] = useSearchParams();
  const [courseId, setCourseId] = useState(params.get('course') ?? '');
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [selected, setSelected] = useState<string[]>([]);
  /** Everyone the filters match, once "Select all N" has read them; null while only a page is ticked. */
  const [everyone, setEveryone] = useState<Person[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  /** Bumped whenever the view or selection changes, so a slow "Select all" read cannot land late. */
  const view = useRef(0);
  const [open, setOpen] = useState<LearnerRow | null>(null);
  const linked = params.get('learner');

  // `?learner=<uid>` (a person picked in global search) opens their drawer, then leaves the URL.
  useEffect(() => {
    if (!linked) return;
    let current = true;
    data.usersByUid([linked]).then(
      ([user]) => {
        if (!current) return;
        setParams({}, { replace: true });
        if (user) setOpen(buildLearnerRows([user], [], [], now, false)[0] as LearnerRow);
        else toast.show('That person was not found.', { tone: 'danger' });
      },
      (error: unknown) => {
        log.warn('Linked learner not loaded', { code: (error as { code?: unknown }).code });
        if (current)
          toast.show(`Could not open that ${terms.learner}. Try again.`, { tone: 'danger' });
      },
    );
    return () => {
      current = false;
    };
  }, [data, linked, now, setParams, toast, terms.learner]);

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
    clearSelection();
  };

  const clearSelection = () => {
    view.current += 1;
    setSelected([]);
    setEveryone(null);
  };

  /** The set the filters narrow to, read once per filter change and reused across tabs and pages. */
  const source = useMemo(() => {
    const prefix = searchPrefix(query);
    return Promise.all([
      courseId ? data.assignments({ courseId }) : meta.assignments,
      team
        ? data.usersInTeam(team)
        : role
          ? data.usersWithRole(role as 'educator' | 'admin')
          : prefix
            ? data.searchUsers(prefix)
            : null,
    ]).then(([scope, users]) => ({ scope, users }));
  }, [data, meta, query, team, role, courseId]);

  const result = useAsync(
    useCallback(async () => {
      const filters = { search: query, team, role, courseId };
      const filtered = isFiltered(filters);
      let scope = meta.assignments;
      let onPage: Person[];
      let total: number;
      let counts = meta.counts;
      let nextCursor: string | null = null;
      if (!filtered && (tab === 'all' || tab === 'signedIn')) {
        const span = allPage(page, PAGE_SIZE, meta.total);
        const people = span.people
          ? await data.usersPage(cursors[page - 1] ?? null, PAGE_SIZE)
          : { rows: [], nextCursor: null };
        nextCursor = people.nextCursor;
        onPage = [
          ...people.rows.map((u): Person => ({ email: u.email, uid: u.uid, user: u })),
          ...(tab === 'all' ? meta.pending.slice(...span.pending) : []),
        ];
        total = meta.counts[tab];
      } else {
        const narrowed = await source;
        scope = narrowed.scope;
        const users = narrowed.users;
        const people = filtered ? filterPeople(users, scope, filters, !team && !role) : meta.people;
        if (filtered) counts = tabCounts(people, scope, now);
        const inTab = onTab(people, tab, scope, now);
        onPage = inTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        total = inTab.length;
      }
      const unread = onPage.filter((p) => p.uid !== null && p.user === null);
      const profiles = unread.length
        ? await data.usersByUid(unread.map((p) => p.uid as string))
        : [];
      const users = onPage
        .map((p) => p.user ?? profiles.find((u) => u.uid === p.uid))
        .filter((u): u is UserRow => u !== undefined);
      const progress = users.length ? await data.progressFor(users.map((u) => u.uid)) : [];
      const order = new Map(onPage.map((p, i) => [p.email, i]));
      const rows = buildLearnerRows(
        users,
        scope.filter((a) => order.has(a.email)),
        progress,
        now,
      ).sort((a, b) => (order.get(a.email) as number) - (order.get(b.email) as number));
      return { rows, total, counts, nextCursor, refresh };
    }, [data, meta, now, source, tab, query, team, role, courseId, page, cursors, refresh]),
  );

  /** Remembers where the next page starts, so Previous and Next never re-read earlier pages. */
  const goTo = (next: number, nextCursor: string | null) => {
    if (next > page && nextCursor !== null) {
      setCursors((c) => {
        const copy = [...c];
        copy[page] = nextCursor;
        return copy;
      });
    }
    setPage(next);
    clearSelection();
  };

  /**
   * Reads every person the current filters and tab match, not only the page on screen. Filtered
   * views already hold them; unfiltered "All" and "Signed in" read the rest of the people by cursor.
   */
  const selectAll = async () => {
    const filters = { search: query, team, role, courseId };
    const stamp = view.current;
    setSelecting(true);
    try {
      let people: Person[] = [];
      if (!isFiltered(filters) && (tab === 'all' || tab === 'signedIn')) {
        let after: string | null = null;
        do {
          const next: UserPage = await data.usersPage(after, SELECT_ALL_READ);
          people.push(...next.rows.map((u): Person => ({ email: u.email, uid: u.uid, user: u })));
          after = next.nextCursor;
        } while (after !== null);
        if (tab === 'all') people.push(...meta.pending);
      } else {
        const narrowed = await source;
        const matched = isFiltered(filters)
          ? filterPeople(narrowed.users, narrowed.scope, filters, !team && !role)
          : meta.people;
        people = onTab(matched, tab, narrowed.scope, now);
      }
      if (stamp !== view.current) return;
      setEveryone(people);
      setSelected(people.map((p) => p.uid ?? p.email));
    } catch (error) {
      log.warn('Selecting every learner failed', { code: (error as { code?: unknown }).code });
      toast.show('Could not select everyone. Try again.', { tone: 'danger' });
    } finally {
      setSelecting(false);
    }
  };

  const rows = result.state === 'ready' ? result.value.rows : [];
  /** The tab counts of the last result, so they do not flicker while the next one loads. */
  const [counts, setCounts] = useState(meta.counts);
  if (result.state === 'ready' && result.value.counts !== counts) setCounts(result.value.counts);
  const emails = everyone
    ? everyone.map((p) => p.email)
    : rows.filter((r) => selected.includes(r.key)).map((r) => r.email);
  const shown = result.state === 'ready' ? result.value.total : 0;
  const pageTicked = rows.length > 0 && rows.every((r) => selected.includes(r.key));

  const table = (
    <Loaded loadable={result}>
      {({ total, nextCursor }) => (
        <DataTable<LearnerRow>
          caption={terms.Learners}
          rows={rows}
          rowKey={(r) => r.key}
          rowLabel={(r) => r.name}
          selectable
          selected={selected}
          onSelectionChange={(keys) => {
            setEveryone(null);
            setSelected(keys);
          }}
          onRowClick={setOpen}
          empty={
            <EmptyState title={`No ${terms.learners} match these filters`}>
              Change or clear the filters to see more.
            </EmptyState>
          }
          columns={[
            {
              id: 'learner',
              header: terms.Learner,
              rowHeader: true,
              cell: (r) => (
                <span className="console-person">
                  <Avatar
                    name={r.name}
                    size={34}
                    tone={
                      r.roles.includes('admin')
                        ? 'admin'
                        : r.roles.includes('educator')
                          ? 'educator'
                          : 'learner'
                    }
                  />
                  <span>
                    <strong>{r.name}</strong>
                    {r.name === r.email ? null : <span className="console-muted">{r.email}</span>}
                    {r.status === 'invited' ? (
                      <span className="console-muted">
                        {r.invitedAt ? `Invited ${longDate(r.invitedAt)}` : 'Invited'}
                      </span>
                    ) : null}
                  </span>
                </span>
              ),
            },
            { id: 'team', header: 'Team', cell: (r) => teamNames(meta.teams, r.teamIds) },
            {
              id: 'role',
              header: 'Role',
              cell: (r) =>
                r.roles
                  .filter((x) => x !== 'learner')
                  .map((x) => (x === 'admin' ? terms.Admin : terms.Educator))
                  .join(', ') || (r.status === 'invited' ? '—' : terms.Learner),
            },
            { id: 'courses', header: 'Courses', cell: (r) => `${r.assigned} · ${r.done} done` },
            {
              id: 'progress',
              header: 'Progress',
              cell: (r) => <ProgressBar value={r.percent} label={`${r.name} progress`} />,
            },
            {
              id: 'active',
              header: 'Last active',
              cell: (r) => (r.lastActive ? longDate(r.lastActive) : '—'),
            },
            {
              id: 'status',
              header: 'Status',
              cell: (r) => (
                <Chip tone={r.overdue ? 'danger' : r.status === 'invited' ? 'warning' : 'accent'}>
                  {r.overdue ? 'Overdue' : r.status === 'invited' ? 'Pending invite' : 'Signed in'}
                </Chip>
              ),
            },
          ]}
          footer={
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={(next) => goTo(next, nextCursor)}
            />
          }
        />
      )}
    </Loaded>
  );

  return (
    <>
      <FilterBar
        label={`Filter ${terms.learners}`}
        canClear={search !== '' || team !== '' || role !== '' || courseId !== ''}
        onClear={() =>
          reset(() => {
            setSearch('');
            setTeam('');
            setRole('');
            setCourseId('');
          })
        }
      >
        <Input
          label="Search people"
          hideLabel
          type="search"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => reset(() => setSearch(e.target.value))}
        />
        <Select
          label="Team"
          hideLabel
          value={team}
          onChange={(e) => reset(() => setTeam(e.target.value))}
        >
          <option value="">Any team</option>
          {meta.teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          label="Course"
          hideLabel
          value={courseId}
          onChange={(e) => reset(() => setCourseId(e.target.value))}
        >
          <option value="">Any course</option>
          {meta.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Select
          label="Role"
          hideLabel
          value={role}
          onChange={(e) => reset(() => setRole(e.target.value))}
        >
          <option value="">Any role</option>
          <option value="educator">{terms.Educator}</option>
          <option value="admin">{terms.Admin}</option>
        </Select>
      </FilterBar>
      <Tabs
        label={`${terms.Learner} groups`}
        value={tab}
        onValueChange={(id) => reset(() => setTab(id as LearnerTab))}
        tabs={tabItems(counts, tab, table)}
      />
      {selected.length > 0 ? (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span>{selected.length} selected</span>
          {!everyone && pageTicked && shown > rows.length ? (
            <Button variant="chrome" loading={selecting} onClick={() => void selectAll()}>
              {`Select all ${shown}`}
            </Button>
          ) : null}
          <Button
            variant="chrome"
            onClick={() => void navigate('/admin/assign', { state: { emails } })}
          >
            Assign course
          </Button>
          <Button
            variant="chrome"
            onClick={() => {
              void service
                .remindLearners({ emails })
                .then((r) =>
                  toast.show(`Reminders sent: ${r.sent}, skipped: ${r.skipped}`, {
                    tone: 'success',
                  }),
                )
                .catch(() =>
                  toast.show('Could not send reminders. Try again.', { tone: 'danger' }),
                );
            }}
          >
            Send reminder
          </Button>
          <Button variant="chrome" onClick={() => setChangingRole(true)}>
            Change role
          </Button>
          <Button variant="chrome" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      ) : null}
      {changingRole ? (
        <BulkRoleDialog
          people={everyone ?? rows.filter((r) => selected.includes(r.key))}
          meUid={me.uid}
          onClose={() => setChangingRole(false)}
          onApply={async (people, change) => {
            let changed = 0;
            let failed = 0;
            for (const p of people) {
              try {
                await service.setRoles({
                  uid: p.uid as string,
                  ...change,
                  ...(change.educator === false ? { grantedCourseIds: [] } : {}),
                });
                changed += 1;
              } catch (e) {
                failed += 1;
                log.error('Changing a role failed', e, { uid: p.uid });
              }
            }
            const skipped = selected.length - people.length;
            toast.show(
              `Roles changed: ${changed}, skipped: ${skipped}${failed ? `, failed: ${failed}` : ''}`,
              { tone: failed ? 'danger' : 'success' },
            );
            setChangingRole(false);
            clearSelection();
            setRefresh((n) => n + 1);
          }}
        />
      ) : null}
      {open ? (
        <LearnerDrawer row={open} courses={meta.courses} now={now} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

/** What to do to one role for everyone selected. */
type RoleAction = 'keep' | 'add' | 'remove';
/** The roles to change; a role left out stays as it is. Educator and Admin are independent. */
type BulkRoleChange = { educator?: boolean; admin?: boolean };

const flag = (key: 'educator' | 'admin', a: RoleAction): BulkRoleChange =>
  a === 'keep' ? {} : { [key]: a === 'add' };

/**
 * Adds or removes Educator and Admin on everyone selected, each on its own, as the Roles screen
 * does. Everyone is a Learner, so there is no third role to pick. Pending invites have no account
 * yet and your own account cannot lose Admin, so those are skipped and counted, not failed.
 */
function BulkRoleDialog({
  people,
  meUid,
  onClose,
  onApply,
}: {
  people: Array<{ uid: string | null }>;
  meUid: string;
  onClose: () => void;
  onApply: (people: Array<{ uid: string | null }>, change: BulkRoleChange) => Promise<void>;
}) {
  const t = useTerms();
  const [educator, setEducator] = useState<RoleAction>('add');
  const [admin, setAdmin] = useState<RoleAction>('keep');
  const [saving, setSaving] = useState(false);
  const eligible = people.filter((p) => p.uid !== null && !(p.uid === meUid && admin === 'remove'));
  const skipped = people.length - eligible.length;
  const nothingToChange = educator === 'keep' && admin === 'keep';
  const change: BulkRoleChange = { ...flag('educator', educator), ...flag('admin', admin) };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Change role"
      footer={
        <Button
          disabled={eligible.length === 0 || nothingToChange}
          loading={saving}
          onClick={() => {
            setSaving(true);
            void onApply(eligible, change).finally(() => setSaving(false));
          }}
        >
          {`Apply to ${eligible.length} ${eligible.length === 1 ? 'person' : 'people'}`}
        </Button>
      }
    >
      <p>
        {`Everyone is ${article(t.Learner)}. ${t.Educator} and ${t.Admin} are separate: change either or both.`}
      </p>
      <Select
        label={t.Educator}
        value={educator}
        onChange={(e) => setEducator(e.target.value as RoleAction)}
      >
        <option value="keep">Leave as it is</option>
        <option value="add">{`Make ${t.Educator}`}</option>
        <option value="remove">{`Remove ${t.Educator}`}</option>
      </Select>
      <Select
        label={t.Admin}
        value={admin}
        onChange={(e) => setAdmin(e.target.value as RoleAction)}
      >
        <option value="keep">Leave as it is</option>
        <option value="add">{`Make ${t.Admin}`}</option>
        <option value="remove">{`Remove ${t.Admin}`}</option>
      </Select>
      {educator === 'add' ? (
        <p>Courses already granted stay as they are. Grant more on Roles &amp; access.</p>
      ) : null}
      {educator === 'remove' ? (
        <p>{`Removing ${t.Educator} also clears their granted courses.`}</p>
      ) : null}
      {skipped > 0 ? (
        <p>
          {skipped} will be skipped: pending invites have no account yet
          {admin === 'remove' ? `, and you cannot remove your own ${t.Admin} role` : ''}.
        </p>
      ) : null}
    </Dialog>
  );
}

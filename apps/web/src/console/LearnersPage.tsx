import {
  Button,
  Chip,
  DataTable,
  Input,
  Pagination,
  ProgressBar,
  Select,
  Tabs,
  useToast,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { longDate } from '../pariksha/model';
import { useConsole } from './ConsoleProvider';
import { LearnerDrawer } from './LearnerDrawer';
import {
  allPage,
  buildLearnerRows,
  filterPeople,
  isFiltered,
  onTab,
  peopleFromAssignments,
  searchPrefix,
  tabCounts,
} from './model';
import type { LearnerRow, LearnerTab, Person } from './model';
import type { AssignmentFull, UserRow } from './types';

export const PAGE_SIZE = 25;
/** How long typing must pause before the search runs. */
export const SEARCH_DELAY_MS = 250;

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

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** `/kulapati/learners`: everyone who signed in plus pending invites, with filters and bulk actions. */
export function LearnersPage() {
  const { data } = useConsole();
  const learner = useLearnerData();
  const [now] = useState(() => new Date());
  const meta = useAsync(
    useCallback(async () => {
      const [assignments, courses, teams, total] = await Promise.all([
        data.assignments(),
        learner.listCourses(),
        data.teams(),
        data.userCount(),
      ]);
      const people = peopleFromAssignments(assignments);
      const pending = onTab(people, 'pending', assignments, now);
      const counts: Record<LearnerTab, number> = {
        all: total + pending.length,
        signedIn: total,
        pending: pending.length,
        overdue: onTab(people, 'overdue', assignments, now).length,
      };
      return { assignments, courses, teams, total, people, pending, counts };
    }, [data, learner, now]),
  );

  return (
    <main className="page console">
      <p className="article__kicker">Kulapati</p>
      <h1 className="page__title">Learners</h1>
      <Loaded loadable={meta}>{(m) => <Learners meta={m} now={now} />}</Loaded>
    </main>
  );
}

interface Meta {
  assignments: AssignmentFull[];
  courses: Course[];
  teams: string[];
  total: number;
  /** Everyone in the newest assignments, and the pending invites among them. */
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
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<LearnerTab>('all');
  const [search, setSearch] = useState('');
  const query = useDebounced(search, SEARCH_DELAY_MS);
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<LearnerRow | null>(null);

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
    setSelected([]);
  };

  /** The set the filters narrow to, read once per filter change and reused across tabs and pages. */
  const source = useMemo(() => {
    const prefix = searchPrefix(query);
    return Promise.all([
      courseId ? data.assignments({ courseId }) : meta.assignments,
      team
        ? data.usersInTeam(team)
        : role
          ? data.usersWithRole(role as 'acharya' | 'kulapati')
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
      return { rows, total, counts, nextCursor };
    }, [data, meta, now, source, tab, query, team, role, courseId, page, cursors]),
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
    setSelected([]);
  };

  const rows = result.state === 'ready' ? result.value.rows : [];
  /** The tab counts of the last result, so they do not flicker while the next one loads. */
  const [counts, setCounts] = useState(meta.counts);
  if (result.state === 'ready' && result.value.counts !== counts) setCounts(result.value.counts);
  const emails = rows.filter((r) => selected.includes(r.key)).map((r) => r.email);

  const table = (
    <Loaded loadable={result}>
      {({ total, nextCursor }) => (
        <DataTable<LearnerRow>
          caption="Learners"
          rows={rows}
          rowKey={(r) => r.key}
          rowLabel={(r) => r.name}
          selectable
          selected={selected}
          onSelectionChange={setSelected}
          onRowClick={setOpen}
          empty={<p>No learners match these filters.</p>}
          columns={[
            {
              id: 'learner',
              header: 'Learner',
              cell: (r) => (
                <span>
                  <strong>{r.name}</strong>
                  {r.name === r.email ? null : <span className="items__kind"> {r.email}</span>}
                  {r.status === 'invited' ? (
                    <span className="items__kind">
                      {r.invitedAt ? ` Invited ${longDate(r.invitedAt)}` : ' Invited'}
                    </span>
                  ) : null}
                </span>
              ),
            },
            { id: 'team', header: 'Team', cell: (r) => r.team ?? '—' },
            {
              id: 'role',
              header: 'Role',
              cell: (r) =>
                r.roles.filter((x) => x !== 'shishya').join(', ') ||
                (r.status === 'invited' ? '—' : 'Shishya'),
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
      <div className="filters">
        <Input
          label="Search people"
          value={search}
          onChange={(e) => reset(() => setSearch(e.target.value))}
        />
        <Select label="Team" value={team} onChange={(e) => reset(() => setTeam(e.target.value))}>
          <option value="">All teams</option>
          {meta.teams.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          label="Course"
          value={courseId}
          onChange={(e) => reset(() => setCourseId(e.target.value))}
        >
          <option value="">All courses</option>
          {meta.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Select label="Role" value={role} onChange={(e) => reset(() => setRole(e.target.value))}>
          <option value="">All roles</option>
          <option value="acharya">Acharya</option>
          <option value="kulapati">Kulapati</option>
        </Select>
      </div>
      <Tabs
        label="Learner groups"
        value={tab}
        onValueChange={(id) => reset(() => setTab(id as LearnerTab))}
        tabs={tabItems(counts, tab, table)}
      />
      {selected.length > 0 ? (
        <div className="bulk-bar" role="region" aria-label="Bulk actions">
          <span>{selected.length} selected</span>
          <Button
            variant="chrome"
            onClick={() => void navigate('/kulapati/assign', { state: { emails } })}
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
          <Link className="g-btn g-btn--chrome" to="/kulapati/roles">
            Change role
          </Link>
          <Button variant="chrome" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}
      {open ? (
        <LearnerDrawer row={open} courses={meta.courses} now={now} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

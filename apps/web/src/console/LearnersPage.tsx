import {
  Button,
  Chip,
  DataTable,
  Dialog,
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
import { useNavigate, useSearchParams } from 'react-router';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useDebounced } from '../data/useDebounced';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { longDate } from '../pariksha/model';
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
import type { AssignmentFull, UserRow } from './types';

export const PAGE_SIZE = 25;

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

/** `/kulapati/learners`: everyone who signed in plus pending invites, with filters and bulk actions. */
export function LearnersPage() {
  const { data } = useConsole();
  const learner = useLearnerData();
  const [now] = useState(() => new Date());
  const meta = useAsync(
    useCallback(async () => {
      const [newest, open, courses, teams, total] = await Promise.all([
        data.assignments(),
        data.openAssignments(now),
        learner.listCourses(),
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
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<LearnerRow | null>(null);
  const [params, setParams] = useSearchParams();
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
        if (current) toast.show('Could not open that learner. Try again.', { tone: 'danger' });
      },
    );
    return () => {
      current = false;
    };
  }, [data, linked, now, setParams, toast]);

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
          <Button variant="chrome" onClick={() => setChangingRole(true)}>
            Change role
          </Button>
          <Button variant="chrome" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}
      {changingRole ? (
        <BulkRoleDialog
          people={rows.filter((r) => selected.includes(r.key))}
          meUid={me.uid}
          onClose={() => setChangingRole(false)}
          onApply={async (people, choice) => {
            let changed = 0;
            let failed = 0;
            for (const p of people) {
              try {
                await service.setRoles({
                  uid: p.uid as string,
                  acharya: choice === 'acharya',
                  kulapati: choice === 'kulapati',
                  ...(choice === 'shishya' ? { grantedCourseIds: [] } : {}),
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
            setSelected([]);
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

type RoleChoice = 'shishya' | 'acharya' | 'kulapati';

/**
 * Sets one role on everyone selected. Pending invites have no account yet and your own account
 * cannot lose Kulapati, so those are skipped and counted rather than failing the batch.
 */
function BulkRoleDialog({
  people,
  meUid,
  onClose,
  onApply,
}: {
  people: LearnerRow[];
  meUid: string;
  onClose: () => void;
  onApply: (people: LearnerRow[], choice: RoleChoice) => Promise<void>;
}) {
  const [choice, setChoice] = useState<RoleChoice>('acharya');
  const [saving, setSaving] = useState(false);
  const eligible = people.filter(
    (p) => p.uid !== null && !(p.uid === meUid && choice !== 'kulapati'),
  );
  const skipped = people.length - eligible.length;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Change role"
      footer={
        <Button
          disabled={eligible.length === 0 || saving}
          onClick={() => {
            setSaving(true);
            void onApply(eligible, choice).finally(() => setSaving(false));
          }}
        >
          {`Apply to ${eligible.length} ${eligible.length === 1 ? 'person' : 'people'}`}
        </Button>
      }
    >
      <fieldset className="dialog-fieldset">
        <legend>Role</legend>
        {(['shishya', 'acharya', 'kulapati'] as const).map((r) => (
          <label key={r} className="choice">
            <input
              type="radio"
              name="bulk-role"
              value={r}
              checked={choice === r}
              onChange={() => setChoice(r)}
            />{' '}
            {r === 'shishya'
              ? 'Shishya (learner)'
              : r === 'acharya'
                ? 'Acharya (educator)'
                : 'Kulapati (admin)'}
          </label>
        ))}
      </fieldset>
      {choice === 'acharya' ? (
        <p>Courses already granted stay as they are. Grant more on Roles &amp; access.</p>
      ) : null}
      {skipped > 0 ? (
        <p>
          {skipped} will be skipped: pending invites have no account yet
          {choice === 'kulapati' ? '' : ', and you cannot remove your own Kulapati role'}.
        </p>
      ) : null}
    </Dialog>
  );
}

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
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import type { CertificateRow, ProgressRow } from '../data/types';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { longDate } from '../pariksha/model';
import { useConsole } from './ConsoleProvider';
import { buildLearnerRows, filterByRole, isOverdue, rowsFromAssignments } from './model';
import type { LearnerRow, LearnerTab } from './model';
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
      const [assignments, courses, teams, total] = await Promise.all([
        data.assignments(),
        learner.listCourses(),
        data.teams(),
        data.userCount(),
      ]);
      const pending = rowsFromAssignments(
        assignments.filter((a) => a.uid === null),
        now,
      );
      const overdue = rowsFromAssignments(
        assignments.filter((a) => isOverdue(a, now)),
        now,
      );
      const counts: Record<LearnerTab, number> = {
        all: total + pending.length,
        signedIn: total,
        pending: pending.length,
        overdue: overdue.length,
      };
      return { assignments, courses, teams, total, pending, overdue, counts };
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
  pending: LearnerRow[];
  overdue: LearnerRow[];
  counts: Record<LearnerTab, number>;
}

/** Filters stay mounted while rows reload, so typing is never interrupted. */
function Learners({ meta, now }: { meta: Meta; now: Date }) {
  const { data, service } = useConsole();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<LearnerTab>('all');
  const [search, setSearch] = useState('');
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

  const result = useAsync(
    useCallback(async () => {
      const fromAssignments =
        tab === 'pending'
          ? meta.pending
          : tab === 'overdue'
            ? meta.overdue
            : courseId
              ? rowsFromAssignments(
                  meta.assignments.filter((a) => a.courseId === courseId),
                  now,
                )
              : null;
      if (fromAssignments) {
        return {
          rows: fromAssignments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
          total: fromAssignments.length,
          nextCursor: null as string | null,
        };
      }
      let users: UserRow[];
      let total = meta.total;
      let nextCursor: string | null = null;
      if (search.trim().length >= 2) {
        users = await data.searchUsers(search);
        total = users.length;
      } else if (team) {
        const all = await data.usersInTeam(team);
        users = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        total = all.length;
      } else {
        const next = await data.usersPage(cursors[page - 1] ?? null, PAGE_SIZE);
        users = next.rows;
        nextCursor = next.nextCursor;
      }
      const progress = await data.progressFor(users.map((u) => u.uid));
      return {
        rows: buildLearnerRows(users, meta.assignments, progress, now, false),
        total,
        nextCursor,
      };
    }, [data, meta, now, tab, search, team, courseId, page, cursors]),
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

  const rows = result.state === 'ready' ? filterByRole(result.value.rows, role) : [];
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
        tabs={tabItems(meta.counts, tab, table)}
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
        <LearnerDrawer row={open} courses={meta.courses} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

function LearnerDrawer({
  row,
  courses,
  onClose,
}: {
  row: LearnerRow;
  courses: readonly Course[];
  onClose: () => void;
}) {
  const { data, service } = useConsole();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const result = useAsync(
    useCallback(async () => {
      if (!row.uid)
        return {
          progress: [] as Array<ProgressRow & { uid: string }>,
          certificates: [] as CertificateRow[],
          reload,
        };
      const [progress, certificates] = await Promise.all([
        data.progressFor([row.uid]),
        data.certificatesFor(row.uid),
      ]);
      return { progress, certificates, reload };
    }, [data, row.uid, reload]),
  );
  const title = (id: string) => courses.find((c) => c.id === id)?.title ?? id;
  const act = async (task: () => Promise<unknown>, done: string) => {
    try {
      await task();
      toast.show(done, { tone: 'success' });
      setReload(reload + 1);
    } catch {
      toast.show('That did not work. Try again.', { tone: 'danger' });
    }
  };

  return (
    <Dialog open onClose={onClose} title={row.name} size="drawer">
      <p>{row.email}</p>
      <Loaded loadable={result}>
        {({ progress, certificates }) => (
          <>
            <h3>Courses</h3>
            {progress.length === 0 ? (
              <p>No activity yet.</p>
            ) : (
              <ul className="course-list">
                {progress.map((p) => (
                  <li key={p.courseId}>
                    <span className="course-row__title">{title(p.courseId)}</span>
                    <ProgressBar value={p.percent} label={`${title(p.courseId)} progress`} />
                    {Object.entries(p.pariksha)
                      .filter(([, r]) => r.attempts > 0)
                      .map(([pid, r]) => (
                        <Button
                          key={pid}
                          variant="secondary"
                          onClick={() =>
                            void act(
                              () =>
                                service.resetCooldown({
                                  uid: row.uid as string,
                                  courseId: p.courseId,
                                  parikshaId: pid,
                                }),
                              'Retake opened',
                            )
                          }
                        >
                          Reset cooldown for {pid} ({r.attempts}{' '}
                          {r.attempts === 1 ? 'attempt' : 'attempts'})
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
            <h3>Certificates</h3>
            {certificates.length === 0 ? (
              <p>None yet.</p>
            ) : (
              <ul className="course-list">
                {certificates.map((c) => (
                  <li key={c.id}>
                    <Link to={`/certificates/${c.id}`}>{c.courseTitle}</Link> · {c.id}
                    {c.revoked ? ' · Revoked' : null}
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void act(
                          () => service.revokeCertificate({ id: c.id, revoked: !c.revoked }),
                          c.revoked ? 'Certificate restored' : 'Certificate revoked',
                        )
                      }
                    >
                      {c.revoked ? 'Restore' : 'Revoke'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Loaded>
    </Dialog>
  );
}

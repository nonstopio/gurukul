import {
  Avatar,
  Button,
  Callout,
  Card,
  Chip,
  DataTable,
  Dialog,
  EmptyState,
  Input,
  Page,
  PageHeader,
  Pagination,
  PeoplePicker,
  StatCard,
  ToggleCard,
  DEFAULT_PAGE_SIZE,
  pageOf,
  useToast,
} from '@gurukul/ui';
import type { Person } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { article } from '../labels/terms';
import type { Terms } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { CourseChoice } from './CourseChoice';
import { useConsole } from './ConsoleProvider';
import { usePeopleLookup } from './usePeopleSearch';
import type { UserRow } from './types';

type RoleKind = 'learner' | 'educator' | 'manager' | 'admin';

/** The three granted roles, held independently: a person can hold any mix of them. */
interface Held {
  educator: boolean;
  manager: boolean;
  admin: boolean;
}

/** What each role does, in a line: on the role cards and on the switches. */
const ROLE_TEXT: Record<RoleKind, string> = {
  learner: 'Everyone signed in. Takes courses and earns certificates.',
  educator: 'Builds and edits the courses they are granted.',
  manager: 'Keeps their teams, assigns them courses and follows their progress.',
  admin: 'Assigns courses, grants roles and sees everything.',
};

const ROLES: readonly RoleKind[] = ['learner', 'educator', 'manager', 'admin'];

type MatrixRow = [string, string, string, string, string];

const matrix = (t: Terms): MatrixRow[] => [
  ['Take courses and earn certificates', 'Yes', 'Yes', 'Yes', 'Yes'],
  ['Build and publish courses', 'No', 'Granted courses', 'No', 'Yes'],
  ['Create and edit teams', 'No', 'No', 'Own teams', 'Yes'],
  ['Assign courses and send reminders', 'No', 'No', 'Own teams', 'Yes'],
  ['Grant and revoke roles', 'No', 'No', 'No', 'Yes'],
  [`See all ${t.learners} and analytics`, 'No', 'Own courses', 'Own teams', 'Yes'],
];

const held = (u: UserRow): Held => ({
  educator: u.roles.includes('educator'),
  manager: u.roles.includes('manager'),
  admin: u.roles.includes('admin'),
});

const STATUS_LABEL: Record<Course['status'], string | undefined> = {
  draft: 'Not published',
  published: undefined,
  archived: 'Archived',
};

const roleName = (role: RoleKind, t: Terms) =>
  ({ learner: t.Learner, educator: t.Educator, manager: t.Manager, admin: t.Admin })[role];

/** How many courses the grant dialog lists before "Show more". */
const COURSES_SHOWN = 6;

const STATUS_NOTE: Record<Course['status'], string> = {
  draft: ' (not published)',
  published: '',
  archived: ' (archived)',
};

/** One page of `rows` at a time (25), with the pager under it when there is more than one page. */
function Paged<T>({
  rows,
  label,
  children,
}: {
  rows: readonly T[];
  label: string;
  children: (onPage: T[]) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  // A role removed on the last page can leave fewer pages than before.
  const shown = Math.min(page, Math.max(1, Math.ceil(rows.length / DEFAULT_PAGE_SIZE)));
  return (
    <>
      {children(pageOf(rows, shown))}
      {rows.length > DEFAULT_PAGE_SIZE ? (
        <Pagination page={shown} total={rows.length} onPageChange={setPage} label={label} />
      ) : null}
    </>
  );
}

/** `/admin/roles`: who holds what, and the dialog that changes it. Everything goes through setRoles. */
export function RolesPage() {
  const { data, service } = useConsole();
  const me = useUser();
  const t = useTerms();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const result = useAsync(
    useCallback(async () => {
      const [educators, managers, admins, courses, everyone, teams] = await Promise.all([
        data.usersWithRole('educator'),
        data.usersWithRole('manager'),
        data.usersWithRole('admin'),
        data.allCourses(),
        data.userCount(),
        data.teamList(),
      ]);
      return { educators, managers, admins, courses, everyone, teams, reload };
    }, [data, reload]),
  );

  const save = async (user: UserRow, roles: Held, courseIds: string[]) => {
    try {
      await service.setRoles({
        uid: user.uid,
        educator: roles.educator,
        manager: roles.manager,
        admin: roles.admin,
        grantedCourseIds: roles.educator ? courseIds : [],
      });
      toast.show(`Updated ${user.displayName || user.email}`, { tone: 'success' });
      setEditing(null);
      setReload(reload + 1);
    } catch (e) {
      log.error('Changing a role failed', e, { uid: user.uid });
      toast.show('Could not change the role. Try again.', { tone: 'danger' });
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow={t.Admin}
        title="Roles & access"
        lead={`Who is ${article(t.Educator)}, ${article(t.Manager)} or ${article(t.Admin)}, and what each role can do.`}
        actions={<Button onClick={() => setEditing('new')}>Grant a role</Button>}
      />
      <Callout tone="note" title="Roles are enforced by security rules">
        <p>Changing a role takes effect the next time the person&apos;s session refreshes.</p>
      </Callout>
      <Loaded loadable={result}>
        {({ educators, managers, admins, courses, everyone, teams }) => (
          <>
            <div className="console-stats">
              {ROLES.map((role) => {
                const name = roleName(role, t);
                const count = {
                  learner: everyone,
                  educator: educators.length,
                  manager: managers.length,
                  admin: admins.length,
                }[role];
                return (
                  <section key={role} aria-label={name}>
                    <StatCard label={name} value={String(count)} sub={ROLE_TEXT[role]} />
                  </section>
                );
              })}
            </div>

            <DataTable<MatrixRow>
              caption="What each role can do"
              rows={matrix(t)}
              rowKey={([what]) => what}
              columns={[
                { id: 'what', header: 'Capability', rowHeader: true, cell: ([what]) => what },
                { id: 'learner', header: t.Learner, cell: (r) => r[1] },
                { id: 'educator', header: t.Educator, cell: (r) => r[2] },
                { id: 'manager', header: t.Manager, cell: (r) => r[3] },
                { id: 'admin', header: t.Admin, cell: (r) => r[4] },
              ]}
            />

            <Card title={t.Educators}>
              {educators.length === 0 ? (
                <EmptyState title={`No ${t.Educators} yet`}>
                  {`Grant the role to someone who builds courses, and they appear here.`}
                </EmptyState>
              ) : (
                <Paged rows={educators} label={`${t.Educators} pages`}>
                  {(onPage) => (
                    <ul className="console-rows">
                      {onPage.map((u) => (
                        <li key={u.uid} className="console-row">
                          <Avatar name={u.displayName || u.email} tone="educator" size={34} />
                          <span className="console-row__text">
                            <strong>{u.displayName || u.email}</strong>
                            <span className="console-row__chips">
                              {u.grantedCourseIds.length === 0 ? (
                                <Chip>No courses yet</Chip>
                              ) : (
                                u.grantedCourseIds.map((id) => (
                                  <Chip key={id}>
                                    {courses.find((c) => c.id === id)?.title ?? id}
                                  </Chip>
                                ))
                              )}
                            </span>
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(u)}
                            aria-label={`Edit ${u.displayName || u.email}`}
                          >
                            Edit
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Paged>
              )}
            </Card>

            <Card title={t.Managers}>
              {managers.length === 0 ? (
                <EmptyState title={`No ${t.Managers} yet`}>
                  {`Grant the role to a team lead, then name them on a team in Teams.`}
                </EmptyState>
              ) : (
                <Paged rows={managers} label={`${t.Managers} pages`}>
                  {(onPage) => (
                    <ul className="console-rows">
                      {onPage.map((u) => {
                        const theirs = teams.filter((x) =>
                          (x.managerEmails ?? []).includes(u.email.toLowerCase()),
                        );
                        return (
                          <li key={u.uid} className="console-row">
                            <Avatar name={u.displayName || u.email} size={34} />
                            <span className="console-row__text">
                              <strong>{u.displayName || u.email}</strong>
                              <span className="console-row__chips">
                                {theirs.length === 0 ? (
                                  <Chip>No teams yet</Chip>
                                ) : (
                                  theirs.map((x) => <Chip key={x.id}>{x.name}</Chip>)
                                )}
                              </span>
                            </span>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setEditing(u)}
                              aria-label={`Edit ${u.displayName || u.email} as ${t.Manager}`}
                            >
                              Edit
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Paged>
              )}
            </Card>

            <Card title={t.Admins}>
              <Paged rows={admins} label={`${t.Admins} pages`}>
                {(onPage) => (
                  <ul className="console-rows">
                    {onPage.map((u) => (
                      <li key={u.uid} className="console-row">
                        <Avatar name={u.displayName || u.email} tone="admin" size={34} />
                        <span className="console-row__text">
                          <strong>{u.displayName || u.email}</strong>
                          <span className="console-muted">{u.email}</span>
                        </span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditing(u)}
                          aria-label={`Edit ${u.displayName || u.email} as ${t.Admin}`}
                        >
                          Edit
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Paged>
            </Card>

            {editing ? (
              <GrantDialog
                key={editing === 'new' ? 'new' : editing.uid}
                initial={editing === 'new' ? null : editing}
                courses={courses}
                meUid={me.uid}
                onClose={() => setEditing(null)}
                onSave={save}
              />
            ) : null}
          </>
        )}
      </Loaded>
    </Page>
  );
}

function GrantDialog({
  initial,
  courses,
  meUid,
  onClose,
  onSave,
}: {
  initial: UserRow | null;
  courses: readonly Course[];
  meUid: string;
  onClose: () => void;
  onSave: (user: UserRow, roles: Held, courseIds: string[]) => Promise<void>;
}) {
  const { data } = useConsole();
  const t = useTerms();
  const [user, setUser] = useState<UserRow | null>(initial);
  const people = usePeopleLookup(data);
  const [roles, setRoles] = useState<Held>(
    initial ? held(initial) : { educator: true, manager: false, admin: false },
  );
  const [courseIds, setCourseIds] = useState<string[]>(initial?.grantedCourseIds ?? []);
  const [courseQuery, setCourseQuery] = useState('');
  const [courseLimit, setCourseLimit] = useState(COURSES_SHOWN);
  const matching = courses.filter((c) =>
    c.title.toLowerCase().includes(courseQuery.trim().toLowerCase()),
  );
  const shown = matching.slice(0, courseLimit);
  const [saving, setSaving] = useState(false);
  const self = user?.uid === meUid;
  const wasAdmin = user?.roles.includes('admin') === true;

  return (
    <Dialog
      open
      size="lg"
      onClose={onClose}
      title={initial ? `Edit ${initial.displayName || initial.email}` : 'Grant a role'}
      footer={
        <Button
          disabled={!user}
          loading={saving}
          onClick={() => {
            setSaving(true);
            void onSave(user as UserRow, roles, courseIds).finally(() => setSaving(false));
          }}
        >
          Save role
        </Button>
      }
    >
      {user ? (
        <p>
          <strong>{user.displayName || user.email}</strong> · {user.email}
        </p>
      ) : (
        <>
          <PeoplePicker
            label="Find a person by name or email"
            value={[]}
            search={people.search}
            total={people.total}
            onChange={(picked) => {
              // One person is wanted: the first pick replaces this field with their roles. The
              // search list can be minutes old, so their roles and courses are read fresh first.
              const found = people.userOf((picked[0] as Person).email) as UserRow;
              void data.usersByUid([found.uid]).then(([fresh]) => {
                const u = fresh ?? found;
                setUser(u);
                setRoles(held(u));
                setCourseIds(u.grantedCourseIds);
              });
            }}
          />
        </>
      )}
      {user ? (
        <fieldset className="console-fieldset">
          <legend>Roles</legend>
          <p>{`Everyone is ${article(t.Learner)}. Add any of the roles below, alone or together.`}</p>
          <div className="console-switches">
            <ToggleCard
              title={t.Educator}
              description={ROLE_TEXT.educator}
              checked={roles.educator}
              onChange={(e) => setRoles({ ...roles, educator: e.target.checked })}
            />
            <ToggleCard
              title={t.Manager}
              description={ROLE_TEXT.manager}
              checked={roles.manager}
              onChange={(e) => setRoles({ ...roles, manager: e.target.checked })}
            />
            <ToggleCard
              title={t.Admin}
              description={ROLE_TEXT.admin}
              checked={roles.admin}
              disabled={self && wasAdmin}
              onChange={(e) => setRoles({ ...roles, admin: e.target.checked })}
            />
          </div>
          {self && wasAdmin ? (
            <p>{`You cannot remove your own ${t.Admin} role. Ask another ${t.Admin}.`}</p>
          ) : null}
          {user.roles.includes('manager') && !roles.manager ? (
            <p>{`Taking the ${t.Manager} role away also takes them off every team they manage. ${t.Admins} look after those teams until someone else is named.`}</p>
          ) : null}
        </fieldset>
      ) : null}
      {user && roles.educator ? (
        <fieldset className="console-fieldset">
          <legend>Courses they may edit</legend>
          <Input
            label="Search courses"
            hideLabel
            type="search"
            placeholder="Search courses"
            value={courseQuery}
            onChange={(e) => {
              setCourseQuery(e.target.value);
              setCourseLimit(COURSES_SHOWN);
            }}
          />
          <p className="console-muted" aria-live="polite">
            {courseQuery.trim()
              ? `${matching.length} of ${courses.length} courses match`
              : `Showing ${shown.length} of ${courses.length} courses`}
            {courseIds.length > 0 ? ` · ${courseIds.length} selected` : ''}
          </p>
          <ul className="console-course-grid g-stagger">
            {shown.map((c) => (
              <CourseChoice
                key={c.id}
                course={c}
                label={`${c.title}${STATUS_NOTE[c.status]}`}
                note={STATUS_LABEL[c.status]}
                selected={courseIds.includes(c.id)}
                onChange={(on) =>
                  setCourseIds(on ? [...courseIds, c.id] : courseIds.filter((id) => id !== c.id))
                }
              />
            ))}
          </ul>
          {matching.length > shown.length ? (
            <Button variant="ghost" onClick={() => setCourseLimit(courseLimit + COURSES_SHOWN)}>
              {`Show ${Math.min(COURSES_SHOWN, matching.length - shown.length)} more`}
            </Button>
          ) : null}
        </fieldset>
      ) : null}
    </Dialog>
  );
}

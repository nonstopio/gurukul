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
  StatCard,
  useToast,
} from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { article } from '../labels/terms';
import type { Terms } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { CourseChoice } from './CourseChoice';
import { useConsole } from './ConsoleProvider';
import { usePeopleSearch } from './usePeopleSearch';
import type { UserRow } from './types';

type RoleKind = 'learner' | 'educator' | 'admin';

/** The two granted roles, held independently: a person can be an Educator, an Admin or both. */
interface Held {
  educator: boolean;
  admin: boolean;
}

const CARDS: Array<{ role: RoleKind; text: string }> = [
  { role: 'learner', text: 'Everyone signed in. Takes courses and earns certificates.' },
  { role: 'educator', text: 'Builds and edits the courses they are granted.' },
  { role: 'admin', text: 'Assigns courses, grants roles and sees everything.' },
];

type MatrixRow = [string, string, string, string];

const matrix = (t: Terms): MatrixRow[] => [
  ['Take courses and earn certificates', 'Yes', 'Yes', 'Yes'],
  ['Build and publish courses', 'No', 'Granted courses', 'Yes'],
  ['Assign courses and send reminders', 'No', 'No', 'Yes'],
  ['Grant and revoke roles', 'No', 'No', 'Yes'],
  [`See all ${t.learners} and analytics`, 'No', 'Own courses', 'Yes'],
];

const held = (u: UserRow): Held => ({
  educator: u.roles.includes('educator'),
  admin: u.roles.includes('admin'),
});

const STATUS_LABEL: Record<Course['status'], string | undefined> = {
  draft: 'Not published',
  published: undefined,
  archived: 'Archived',
};

const STATUS_NOTE: Record<Course['status'], string> = {
  draft: ' (not published)',
  published: '',
  archived: ' (archived)',
};

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
      const [educators, admins, courses, everyone] = await Promise.all([
        data.usersWithRole('educator'),
        data.usersWithRole('admin'),
        data.allCourses(),
        data.userCount(),
      ]);
      return { educators, admins, courses, everyone, reload };
    }, [data, reload]),
  );

  const save = async (user: UserRow, roles: Held, courseIds: string[]) => {
    try {
      await service.setRoles({
        uid: user.uid,
        educator: roles.educator,
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
        lead={`Who is ${article(t.Educator)} or ${article(t.Admin)}, and what each role can do.`}
        actions={<Button onClick={() => setEditing('new')}>Grant a role</Button>}
      />
      <Callout tone="note" title="Roles are enforced by security rules">
        <p>Changing a role takes effect the next time the person&apos;s session refreshes.</p>
      </Callout>
      <Loaded loadable={result}>
        {({ educators, admins, courses, everyone }) => (
          <>
            <div className="console-stats">
              {CARDS.map((c) => {
                const name = { learner: t.Learner, educator: t.Educator, admin: t.Admin }[c.role];
                const count =
                  c.role === 'educator'
                    ? educators.length
                    : c.role === 'admin'
                      ? admins.length
                      : everyone;
                return (
                  <section key={c.role} aria-label={name}>
                    <StatCard label={name} value={String(count)} sub={c.text} />
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
                { id: 'admin', header: t.Admin, cell: (r) => r[3] },
              ]}
            />

            <Card title={t.Educators}>
              {educators.length === 0 ? (
                <EmptyState title={`No ${t.Educators} yet`}>
                  {`Grant the role to someone who builds courses, and they appear here.`}
                </EmptyState>
              ) : (
                <ul className="console-rows">
                  {educators.map((u) => (
                    <li key={u.uid} className="console-row">
                      <Avatar name={u.displayName || u.email} tone="educator" size={34} />
                      <span className="console-row__text">
                        <strong>{u.displayName || u.email}</strong>
                        <span className="console-row__chips">
                          {u.grantedCourseIds.length === 0 ? (
                            <Chip>No courses yet</Chip>
                          ) : (
                            u.grantedCourseIds.map((id) => (
                              <Chip key={id}>{courses.find((c) => c.id === id)?.title ?? id}</Chip>
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
            </Card>

            <Card title={t.Admins}>
              <ul className="console-rows">
                {admins.map((u) => (
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
  const people = usePeopleSearch(data);
  const [roles, setRoles] = useState<Held>(
    initial ? held(initial) : { educator: true, admin: false },
  );
  const [courseIds, setCourseIds] = useState<string[]>(initial?.grantedCourseIds ?? []);
  const [saving, setSaving] = useState(false);
  const self = user?.uid === meUid;
  const wasAdmin = user?.roles.includes('admin') === true;

  return (
    <Dialog
      open
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
          <Input
            label="Find a person by name or email"
            value={people.query}
            onChange={(e) => void people.search(e.target.value)}
          />
          <ul className="console-rows" aria-label="People found">
            {people.found.map((u) => (
              <li key={u.uid}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setUser(u);
                    setRoles(held(u));
                    setCourseIds(u.grantedCourseIds);
                  }}
                >
                  {u.displayName || u.email}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {user ? (
        <fieldset className="console-fieldset">
          <legend>Roles</legend>
          <p>{`Everyone is ${article(t.Learner)}. Add either or both of the roles below.`}</p>
          <label className="console-choice">
            <input
              type="checkbox"
              checked={roles.educator}
              onChange={(e) => setRoles({ ...roles, educator: e.target.checked })}
            />{' '}
            {t.Educator}
          </label>
          <label className="console-choice">
            <input
              type="checkbox"
              checked={roles.admin}
              disabled={self && wasAdmin}
              onChange={(e) => setRoles({ ...roles, admin: e.target.checked })}
            />{' '}
            {t.Admin}
          </label>
          {self && wasAdmin ? (
            <p>{`You cannot remove your own ${t.Admin} role. Ask another ${t.Admin}.`}</p>
          ) : null}
        </fieldset>
      ) : null}
      {user && roles.educator ? (
        <fieldset className="console-fieldset">
          <legend>Courses they may edit</legend>
          <ul className="learn-cards g-stagger">
            {courses.map((c) => (
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
        </fieldset>
      ) : null}
    </Dialog>
  );
}

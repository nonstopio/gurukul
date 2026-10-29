import { Button, Callout, Chip, Dialog, Input, useToast } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { article } from '../labels/terms';
import type { Terms } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { usePeopleSearch } from './usePeopleSearch';
import type { UserRow } from './types';

type RoleKind = 'learner' | 'educator' | 'admin';

/** The two granted roles, held independently: a person can be an Educator, an Admin or both. */
interface Held {
  educator: boolean;
  admin: boolean;
}

const CARDS: Array<{ role: RoleKind; english: string; text: string }> = [
  {
    role: 'learner',
    english: 'Learner',
    text: 'Everyone signed in. Takes courses and earns certificates.',
  },
  { role: 'educator', english: 'Educator', text: 'Builds and edits the courses they are granted.' },
  {
    role: 'admin',
    english: 'Administrator',
    text: 'Assigns courses, grants roles and sees everything.',
  },
];

const matrix = (t: Terms): Array<[string, string, string, string]> => [
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
    <main className="page console">
      <p className="article__kicker">{t.Admin}</p>
      <h1 className="page__title">Roles & access</h1>
      <Callout tone="note" title="Roles are enforced by security rules">
        <p>Changing a role takes effect the next time the person&apos;s session refreshes.</p>
      </Callout>
      <Loaded loadable={result}>
        {({ educators, admins, courses, everyone }) => (
          <>
            <div className="role-cards">
              {CARDS.map((c) => (
                <section key={c.role} className="role-card" aria-label={c.english}>
                  <Chip
                    tone={
                      c.role === 'admin' ? 'solid' : c.role === 'educator' ? 'warning' : 'neutral'
                    }
                  >
                    {{ learner: t.Learner, educator: t.Educator, admin: t.Admin }[c.role]}
                  </Chip>
                  <p className="role-card__count">
                    {c.role === 'educator'
                      ? educators.length
                      : c.role === 'admin'
                        ? admins.length
                        : everyone}
                  </p>
                  <h2>{c.english}</h2>
                  <p>{c.text}</p>
                </section>
              ))}
            </div>

            <table className="plain-table">
              <caption className="sr-only">What each role can do</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col">{t.Learner}</th>
                  <th scope="col">{t.Educator}</th>
                  <th scope="col">{t.Admin}</th>
                </tr>
              </thead>
              <tbody>
                {matrix(t).map(([what, ...cells]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    {cells.map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <section aria-labelledby="educators-title" className="home-section">
              <div className="cert-actions">
                <h2 id="educators-title">{t.Educators}</h2>
                <Button onClick={() => setEditing('new')}>Grant a role</Button>
              </div>
              {educators.length === 0 ? (
                <p>{`No ${t.Educators} yet.`}</p>
              ) : (
                <ul className="course-list">
                  {educators.map((u) => (
                    <li key={u.uid} className="course-row">
                      <span className="course-row__title">{u.displayName || u.email}</span>
                      <span className="course-row__meta">
                        {u.grantedCourseIds.length === 0 ? (
                          <Chip>No courses yet</Chip>
                        ) : (
                          u.grantedCourseIds.map((id) => (
                            <Chip key={id}>{courses.find((c) => c.id === id)?.title ?? id}</Chip>
                          ))
                        )}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(u)}
                        aria-label={`Edit ${u.displayName || u.email}`}
                      >
                        Edit
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="admins-title" className="home-section">
              <h2 id="admins-title">{t.Admins}</h2>
              <ul className="course-list">
                {admins.map((u) => (
                  <li key={u.uid} className="course-row">
                    <span className="course-row__title">{u.displayName || u.email}</span>
                    <span className="course-row__meta">{u.email}</span>
                    <Button
                      variant="secondary"
                      onClick={() => setEditing(u)}
                      aria-label={`Edit ${u.displayName || u.email} as ${t.Admin}`}
                    >
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            </section>

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
    </main>
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
          disabled={!user || saving}
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
          <ul className="course-list" aria-label="People found">
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
        <fieldset className="dialog-fieldset">
          <legend>Roles</legend>
          <p>{`Everyone is ${article(t.Learner)}. Add either or both of the roles below.`}</p>
          <label className="choice">
            <input
              type="checkbox"
              checked={roles.educator}
              onChange={(e) => setRoles({ ...roles, educator: e.target.checked })}
            />{' '}
            {t.Educator}
          </label>
          <label className="choice">
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
        <fieldset className="dialog-fieldset">
          <legend>Courses they may edit</legend>
          {courses.map((c) => (
            <label key={c.id} className="choice">
              <input
                type="checkbox"
                checked={courseIds.includes(c.id)}
                onChange={(e) =>
                  setCourseIds(
                    e.target.checked ? [...courseIds, c.id] : courseIds.filter((id) => id !== c.id),
                  )
                }
              />{' '}
              {c.title}
              {STATUS_NOTE[c.status]}
            </label>
          ))}
        </fieldset>
      ) : null}
    </Dialog>
  );
}

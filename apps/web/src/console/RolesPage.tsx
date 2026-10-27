import { Button, Callout, Chip, Dialog, Input, useToast } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { log } from '../log';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import type { UserRow } from './types';

type RoleChoice = 'shishya' | 'acharya' | 'kulapati';

const CARDS: Array<{ role: RoleChoice; english: string; text: string }> = [
  {
    role: 'shishya',
    english: 'Learner',
    text: 'Everyone signed in. Takes courses and earns certificates.',
  },
  { role: 'acharya', english: 'Educator', text: 'Builds and edits the courses they are granted.' },
  {
    role: 'kulapati',
    english: 'Administrator',
    text: 'Assigns courses, grants roles and sees everything.',
  },
];

const MATRIX: Array<[string, string, string, string]> = [
  ['Take courses and earn certificates', 'Yes', 'Yes', 'Yes'],
  ['Build and publish courses', 'No', 'Granted courses', 'Yes'],
  ['Assign courses and send reminders', 'No', 'No', 'Yes'],
  ['Grant and revoke roles', 'No', 'No', 'Yes'],
  ['See all learners and analytics', 'No', 'Own courses', 'Yes'],
];

function currentRole(u: UserRow): RoleChoice {
  return u.roles.includes('kulapati')
    ? 'kulapati'
    : u.roles.includes('acharya')
      ? 'acharya'
      : 'shishya';
}

/** `/kulapati/roles`: who holds what, and the dialog that changes it. Everything goes through setRoles. */
export function RolesPage() {
  const { data, service } = useConsole();
  const learner = useLearnerData();
  const me = useUser();
  const toast = useToast();
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const result = useAsync(
    useCallback(async () => {
      const [acharyas, kulapatis, courses] = await Promise.all([
        data.usersWithRole('acharya'),
        data.usersWithRole('kulapati'),
        learner.listCourses(),
      ]);
      return { acharyas, kulapatis, courses, reload };
    }, [data, learner, reload]),
  );

  const save = async (user: UserRow, role: RoleChoice, courseIds: string[]) => {
    try {
      await service.setRoles({
        uid: user.uid,
        acharya: role === 'acharya',
        kulapati: role === 'kulapati',
        grantedCourseIds: role === 'acharya' ? courseIds : [],
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
      <p className="article__kicker">Kulapati</p>
      <h1 className="page__title">Roles & access</h1>
      <Callout tone="note" title="Roles are enforced by security rules">
        <p>Changing a role takes effect the next time the person&apos;s session refreshes.</p>
      </Callout>
      <Loaded loadable={result}>
        {({ acharyas, kulapatis, courses }) => (
          <>
            <div className="role-cards">
              {CARDS.map((c) => (
                <section key={c.role} className="role-card" aria-label={c.english}>
                  <Chip
                    tone={
                      c.role === 'kulapati' ? 'solid' : c.role === 'acharya' ? 'warning' : 'neutral'
                    }
                  >
                    {c.role === 'shishya'
                      ? 'Shishya'
                      : c.role === 'acharya'
                        ? 'Acharya'
                        : 'Kulapati'}
                  </Chip>
                  <p className="role-card__count">
                    {c.role === 'acharya'
                      ? acharyas.length
                      : c.role === 'kulapati'
                        ? kulapatis.length
                        : 'Everyone'}
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
                  <th scope="col">Shishya</th>
                  <th scope="col">Acharya</th>
                  <th scope="col">Kulapati</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map(([what, ...cells]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    {cells.map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <section aria-labelledby="acharyas-title" className="home-section">
              <div className="cert-actions">
                <h2 id="acharyas-title">Acharyas</h2>
                <Button onClick={() => setEditing('new')}>Grant a role</Button>
              </div>
              {acharyas.length === 0 ? (
                <p>No Acharyas yet.</p>
              ) : (
                <ul className="course-list">
                  {acharyas.map((u) => (
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
  onSave: (user: UserRow, role: RoleChoice, courseIds: string[]) => Promise<void>;
}) {
  const { data } = useConsole();
  const [user, setUser] = useState<UserRow | null>(initial);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<UserRow[]>([]);
  const [role, setRole] = useState<RoleChoice>(initial ? currentRole(initial) : 'acharya');
  const [courseIds, setCourseIds] = useState<string[]>(initial?.grantedCourseIds ?? []);
  const [saving, setSaving] = useState(false);
  const self = user?.uid === meUid;
  const wasKulapati = user?.roles.includes('kulapati') === true;

  const search = async (text: string) => {
    setQuery(text);
    setFound(text.trim().length >= 2 ? await data.searchUsers(text) : []);
  };

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
            void onSave(user as UserRow, role, courseIds).finally(() => setSaving(false));
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
            label="Find a person by email"
            value={query}
            onChange={(e) => void search(e.target.value)}
          />
          <ul className="course-list" aria-label="People found">
            {found.map((u) => (
              <li key={u.uid}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setUser(u);
                    setRole(currentRole(u));
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
          <legend>Role</legend>
          {(['shishya', 'acharya', 'kulapati'] as const).map((r) => (
            <label key={r} className="choice">
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                disabled={self && wasKulapati && r !== 'kulapati'}
                onChange={() => setRole(r)}
              />{' '}
              {r === 'shishya'
                ? 'Shishya (learner)'
                : r === 'acharya'
                  ? 'Acharya (educator)'
                  : 'Kulapati (admin)'}
            </label>
          ))}
          {self && wasKulapati ? (
            <p>You cannot remove your own Kulapati role. Ask another Kulapati.</p>
          ) : null}
        </fieldset>
      ) : null}
      {user && role === 'acharya' ? (
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
            </label>
          ))}
        </fieldset>
      ) : null}
    </Dialog>
  );
}

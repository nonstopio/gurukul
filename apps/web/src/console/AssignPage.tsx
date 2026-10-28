import { classifyEmails, parseCsvEmails, summarize } from '@gurukul/schema';
import type { ClassifiedEmail, Reminder } from '@gurukul/schema';
import {
  Button,
  EmailChipInput,
  Input,
  Select,
  Stepper,
  Tabs,
  Toggle,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { usePeopleSearch } from './usePeopleSearch';

interface Prefill {
  emails?: string[];
  courseId?: string;
}

/** `/kulapati/assign`: pick courses, pick people, set a deadline; the preview is what will happen. */
export function AssignPage() {
  const { data, service } = useConsole();
  const learner = useLearnerData();
  const navigate = useNavigate();
  const toast = useToast();
  const prefill = (useLocation().state ?? {}) as Prefill;
  const [courseIds, setCourseIds] = useState<string[]>(prefill.courseId ? [prefill.courseId] : []);
  const [emails, setEmails] = useState<string[]>(prefill.emails ?? []);
  const [due, setDue] = useState('');
  const [reminder, setReminder] = useState<Reminder>('weekly');
  const [mandatory, setMandatory] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const people = usePeopleSearch(data);
  const [team, setTeam] = useState('');
  const [known, setKnown] = useState<{
    signedIn: ReadonlySet<string>;
    assigned: ReadonlySet<string>;
  }>({
    signedIn: new Set(),
    assigned: new Set(),
  });
  const result = useAsync(
    useCallback(async () => {
      const [courses, teams] = await Promise.all([learner.listCourses(), data.teams()]);
      return { courses: courses.filter((c) => c.status === 'published'), teams };
    }, [learner, data]),
  );

  useEffect(() => {
    let live = true;
    void data.knownEmails(emails, courseIds).then((k) => live && setKnown(k));
    return () => {
      live = false;
    };
  }, [data, emails, courseIds]);

  const classify = (email: string) => classifyEmails([email], known)[0] as ClassifiedEmail;
  const classified = classifyEmails(emails, known);
  const summary = summarize(classified);
  const assignable = summary.signedIn + summary.newInvites;
  const add = (more: string[]) =>
    setEmails([...new Set([...emails, ...more.map((e) => e.trim().toLowerCase())])]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await service.assignCourses({
        courseIds,
        emails,
        dueAt: due ? Date.parse(`${due}T23:59:59`) : null,
        mandatory,
        reminder,
        notify,
      });
      toast.show(
        `Assigned to ${res.summary.signedIn + res.summary.newInvites} people (${res.summary.newInvites} pending invites)`,
        { tone: 'success' },
      );
      void navigate('/kulapati/learners');
    } catch {
      toast.show('Could not assign. Nothing was changed; try again.', { tone: 'danger' });
      setBusy(false);
    }
  };

  return (
    <main className="page console">
      <p className="article__kicker">Kulapati</p>
      <h1 className="page__title">Assign courses</h1>
      <Loaded loadable={result}>
        {({ courses, teams }) => (
          <div className="assign">
            <div className="assign__steps">
              <Stepper.Step number={1} title="Courses">
                <ul className="course-grid">
                  {courses.map((c) => (
                    <li key={c.id}>
                      <label className="choice course-choice">
                        <input
                          type="checkbox"
                          checked={courseIds.includes(c.id)}
                          onChange={(e) =>
                            setCourseIds(
                              e.target.checked
                                ? [...courseIds, c.id]
                                : courseIds.filter((id) => id !== c.id),
                            )
                          }
                        />{' '}
                        <strong>{c.title}</strong>
                        <span className="items__kind">{c.estimatedMinutes} min</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Stepper.Step>

              <Stepper.Step number={2} title="People">
                <EmailChipInput
                  label="Email addresses"
                  value={emails}
                  onChange={setEmails}
                  classify={classify}
                />
                <p className="items__kind">
                  Chips show whether each person has signed in, is new (a pending invite), already
                  has the course, or cannot be assigned.
                </p>
                <Tabs
                  label="Add people"
                  tabs={[
                    {
                      id: 'search',
                      label: 'Search people',
                      panel: (
                        <>
                          <Input
                            label="Search by name or email"
                            value={people.query}
                            onChange={(e) => void people.search(e.target.value)}
                          />
                          <ul className="course-list" aria-label="People found">
                            {people.found.map((u) => (
                              <li key={u.uid}>
                                <Button variant="secondary" onClick={() => add([u.email])}>
                                  Add {u.displayName || u.email}
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </>
                      ),
                    },
                    {
                      id: 'paste',
                      label: 'Paste emails',
                      panel: (
                        <p>
                          Paste a list into the box above: commas, spaces or new lines all work.
                        </p>
                      ),
                    },
                    {
                      id: 'csv',
                      label: 'Upload CSV',
                      panel: (
                        <Input
                          label="CSV file (emails in the first column)"
                          type="file"
                          accept=".csv,text/csv"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) add(parseCsvEmails(await file.text()));
                          }}
                        />
                      ),
                    },
                    {
                      id: 'team',
                      label: 'Whole team',
                      panel: (
                        <>
                          <Select
                            label="Team"
                            value={team}
                            onChange={(e) => setTeam(e.target.value)}
                          >
                            <option value="">Choose a team</option>
                            {teams.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </Select>
                          <Button
                            variant="secondary"
                            disabled={!team}
                            onClick={async () =>
                              add((await data.usersInTeam(team)).map((u) => u.email))
                            }
                          >
                            Add everyone in this team
                          </Button>
                        </>
                      ),
                    },
                  ]}
                />
              </Stepper.Step>

              <Stepper.Step number={3} title="Deadline">
                <Input
                  label="Due date"
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                <Select
                  label="Reminders"
                  value={reminder}
                  onChange={(e) => setReminder(e.target.value as Reminder)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="beforeDue">Before the due date</option>
                  <option value="none">None</option>
                </Select>
                <Toggle
                  label="Mandatory"
                  checked={mandatory}
                  onChange={(e) => setMandatory(e.target.checked)}
                />
                <Toggle
                  label="Email learners now"
                  checked={notify}
                  onChange={(e) => setNotify(e.target.checked)}
                />
              </Stepper.Step>
            </div>

            <aside className="assign__summary" aria-label="Summary">
              <p className="assign__big">{assignable}</p>
              <p>
                {assignable === 1 ? 'person will' : 'people will'} get{' '}
                {courseIds.length === 1
                  ? (courses.find((c) => c.id === courseIds[0])?.title ?? 'this course')
                  : `${courseIds.length} courses`}
              </p>
              <dl className="course__stats">
                <dt>Signed in</dt>
                <dd>{summary.signedIn}</dd>
                <dt>New (pending invite)</dt>
                <dd>{summary.newInvites}</dd>
                <dt>Already assigned</dt>
                <dd>{summary.alreadyAssigned}</dd>
                <dt>Rejected</dt>
                <dd>{summary.rejected.length}</dd>
                <dt>Due</dt>
                <dd>{due || 'No deadline'}</dd>
              </dl>
              {summary.rejected.length > 0 ? (
                <ul aria-label="Rejected addresses">
                  {summary.rejected.map((r) => (
                    <li key={r.email}>
                      {r.email}: {r.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Button
                disabled={busy || courseIds.length === 0 || assignable === 0}
                onClick={() => void submit()}
                aria-busy={busy}
              >
                {assignable > 0
                  ? `Assign to ${assignable} ${assignable === 1 ? 'person' : 'people'}`
                  : 'Assign'}
              </Button>
              <p className="items__kind">
                People who have not signed in yet are invited: the course appears the first time
                they sign in with their NonStop account.
              </p>
            </aside>
          </div>
        )}
      </Loaded>
    </main>
  );
}

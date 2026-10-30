import { classifyEmails, parseCsvEmails, summarize, teamId } from '@gurukul/schema';
import type { ClassifiedEmail, Reminder, Team } from '@gurukul/schema';
import type { Person as PickerPerson } from '@gurukul/ui';
import {
  Button,
  EmailChipInput,
  EmptyState,
  FlowPanel,
  FlowSteps,
  Input,
  Page,
  PageHeader,
  PeoplePicker,
  Select,
  SuccessCheck,
  Tabs,
  Toggle,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toastError } from '../errors';
import { CourseChoice } from './CourseChoice';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { MAX_MEMBERS, checkTeamName } from './model';
import { usePeopleLookup } from './usePeopleSearch';
import type { AssignResult, KnownEmails } from './types';

const peopleLabel = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

const NO_TEAMS: Team[] = [];
const stamp = () => Date.now();
const STEPS = ['Course', 'Audience', 'Schedule', 'Review'] as const;
const HEADINGS = ['Choose courses', 'Who is it for?', 'Set the deadline', 'Review and assign'];

interface Prefill {
  emails?: string[];
  courseId?: string;
}

/**
 * `/admin/assign`: four steps (Course, Audience, Schedule, Review). Nothing is assigned until the
 * Assign button on the last one; leaving half-way costs nothing.
 */
export function AssignPage() {
  const { data, service } = useConsole();
  const t = useTerms();
  const learner = useLearnerData();
  const toast = useToast();
  const prefill = (useLocation().state ?? {}) as Prefill;
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [problem, setProblem] = useState<{ message: string } | null>(null);
  const [courseIds, setCourseIds] = useState<string[]>(prefill.courseId ? [prefill.courseId] : []);
  const [query, setQuery] = useState('');
  const [emails, setEmails] = useState<string[]>(prefill.emails ?? []);
  const [due, setDue] = useState('');
  const [reminder, setReminder] = useState<Reminder>('weekly');
  const [mandatory, setMandatory] = useState(true);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const findPeople = usePeopleLookup(data);
  const [picked, setPicked] = useState<PickerPerson[]>([]);
  const [team, setTeam] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [teamPeople, setTeamPeople] = useState<{ team: string; emails: string[] } | null>(null);
  const teamEmails = teamPeople?.team === team ? teamPeople.emails : null;
  const [dragging, setDragging] = useState(false);
  const [known, setKnown] = useState<KnownEmails>({
    signedIn: new Set(),
    assigned: new Set(),
    byCourse: {},
  });
  const [failed, setFailed] = useState<AssignResult['failed']>([]);
  const [done, setDone] = useState<{ people: number; pending: number; courses: string[] } | null>(
    null,
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const problemRef = useRef<HTMLParagraphElement>(null);
  const moved = useRef(false);

  const courseList = useAsync(
    useCallback(async () => {
      const courses = await learner.listCourses();
      return courses.filter((c) => c.status === 'published');
    }, [learner]),
  );
  const teamList = useAsync(useCallback(() => data.teamList(), [data]));
  const courses = courseList.state === 'ready' ? courseList.value : [];
  const teams = teamList.state === 'ready' ? teamList.value : NO_TEAMS;

  useEffect(() => {
    let live = true;
    void data.knownEmails(emails, courseIds).then((k) => live && setKnown(k));
    return () => {
      live = false;
    };
  }, [data, emails, courseIds]);

  useEffect(() => {
    if (!team) return;
    // Everyone listed on the team, plus anyone whose profile says they are on it. An answer that
    // lands after another team was chosen is ignored: `teamEmails` checks the team it belongs to.
    void data.usersInTeam(team).then((rows) => {
      const listed = (teams.find((x) => x.name === team) as Team).memberEmails;
      setTeamPeople({ team, emails: [...new Set([...listed, ...rows.map((u) => u.email)])] });
    });
  }, [data, team, teams]);

  // Each step's heading takes focus when the step changes; a problem takes it when one is shown.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (problem) problemRef.current?.focus();
  }, [problem]);

  const classify = (email: string) => classifyEmails([email], known)[0] as ClassifiedEmail;
  const classified = classifyEmails(emails, known);
  const summary = summarize(classified);
  const assignable = summary.signedIn + summary.newInvites;
  const add = (more: string[]) =>
    setEmails([...new Set([...emails, ...more.map((e) => e.trim().toLowerCase())])]);
  const readCsv = async (file: File | undefined) => {
    if (file) add(parseCsvEmails(await file.text()));
  };

  const go = (to: number) => {
    moved.current = true;
    setDirection(to > step ? 'forward' : 'back');
    setProblem(null);
    setStep(to);
  };

  /** What is wrong with the step, in words, or nothing. */
  const check = (): string | null => {
    if (step === 0)
      return courseIds.length === 0 ? 'Choose at least one course to continue.' : null;
    if (step !== 1) return null;
    if (assignable === 0) return 'Add at least one person who can be assigned.';
    if (!newTeam.trim()) return null;
    const named = checkTeamName(teams, newTeam, null);
    if ('error' in named) return named.error;
    if (teams.some((x) => x.id === teamId(named.name))) {
      return 'A team with a very similar name exists. Use a different name.';
    }
    if (assignable > MAX_MEMBERS) return `A team holds at most ${MAX_MEMBERS} people.`;
    return null;
  };

  const next = () => {
    const message = check();
    if (message) return setProblem({ message });
    go(step + 1);
  };

  const send = (ids: string[], to: string[]) =>
    service.assignCourses({
      courseIds: ids,
      emails: to,
      dueAt: due ? Date.parse(`${due}T23:59:59`) : null,
      mandatory,
      reminder,
      notify,
    });

  const finish = (res: AssignResult[]) => {
    const left = res.flatMap((r) => r.failed);
    if (left.length > 0) {
      setFailed(left);
      toast.show(
        `${left.length} ${left.length === 1 ? 'assignment' : 'assignments'} could not be saved. The rest went through.`,
        { tone: 'danger' },
      );
      setBusy(false);
      return;
    }
    const first = res[0] as AssignResult;
    const people = first.summary.signedIn + first.summary.newInvites;
    const pending = first.summary.newInvites;
    toast.show(
      `Assigned to ${people} ${people === 1 ? 'person' : 'people'} (${pending} pending ${pending === 1 ? 'invite' : 'invites'})`,
      { tone: 'success' },
    );
    setFailed([]);
    setBusy(false);
    setDone({ people, pending, courses: courseIds });
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (newTeam.trim()) {
        const name = newTeam.trim();
        const members = classified.filter((c) => c.status !== 'rejected').map((c) => c.email);
        await data.saveTeam(
          { id: teamId(name), name, memberEmails: members, createdAt: stamp() },
          null,
        );
        setNewTeam('');
      }
      finish([await send(courseIds, emails)]);
    } catch (e) {
      toastError(toast, e, 'Could not assign. Nothing was changed; try again.');
      setBusy(false);
    }
  };

  /** Re-sends only the pairs that failed, one request per course; what still fails stays listed. */
  const retry = async () => {
    setBusy(true);
    const ids = [...new Set(failed.map((f) => f.courseId))];
    try {
      const res = await Promise.all(
        ids.map((id) =>
          send(
            [id],
            failed.filter((f) => f.courseId === id).map((f) => f.email),
          ),
        ),
      );
      finish(res);
    } catch (e) {
      toastError(toast, e, 'Could not retry. Try again.');
      setBusy(false);
    }
  };

  const reset = () => {
    setDone(null);
    setCourseIds([]);
    setEmails([]);
    setPicked([]);
    setDue('');
    setStep(0);
    setDirection('back');
  };

  // The people chosen in the picker who are still on the list (removing a chip above drops them here).
  const shown = picked.filter((p) => emails.includes(p.email));
  const titleOf = (id: string) => courses.find((c) => c.id === id)?.title ?? id;
  const chosenTitles =
    courseIds.length === 1
      ? (courses.find((c) => c.id === courseIds[0])?.title ?? 'this course')
      : `${courseIds.length} courses`;
  const shownCourses = courses.filter((c) =>
    c.title.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const courseStep = (
    <>
      <Input
        label="Search courses"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <Loaded loadable={courseList}>
        {() =>
          courses.length === 0 ? (
            <EmptyState title="No published courses yet">
              Publish a course in the Studio, then assign it here.
            </EmptyState>
          ) : shownCourses.length === 0 ? (
            <EmptyState title={`No course matches “${query.trim()}”`}>
              Try a shorter search.
            </EmptyState>
          ) : (
            <ul className="learn-cards g-stagger">
              {shownCourses.map((c) => (
                <CourseChoice
                  key={c.id}
                  course={c}
                  selected={courseIds.includes(c.id)}
                  onChange={(on) =>
                    setCourseIds(on ? [...courseIds, c.id] : courseIds.filter((id) => id !== c.id))
                  }
                />
              ))}
            </ul>
          )
        }
      </Loaded>
    </>
  );

  const audienceStep = (
    <>
      <EmailChipInput
        label="Email addresses"
        value={emails}
        onChange={setEmails}
        classify={classify}
      />
      <p className="console-muted" aria-live="polite">
        {`${peopleLabel(assignable)} will be assigned.`} Chips show whether each person has signed
        in, is new (a pending invite), already has the course, or cannot be assigned.
      </p>
      <Tabs
        label="Add people"
        tabs={[
          {
            id: 'team',
            label: 'Existing team',
            panel: (
              <Loaded loadable={teamList}>
                {(found) =>
                  found.length === 0 ? (
                    <EmptyState title="No teams yet">
                      Create one on the Teams page, or use the New team tab to make one now.
                    </EmptyState>
                  ) : (
                    <>
                      <Select label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
                        <option value="">Choose a team</option>
                        {found.map((x) => (
                          <option key={x.id} value={x.name}>
                            {x.name}
                          </option>
                        ))}
                      </Select>
                      {team ? (
                        <p className="console-muted" aria-live="polite">
                          {teamEmails === null
                            ? 'Counting…'
                            : `${peopleLabel(teamEmails.length)} in ${team}`}
                        </p>
                      ) : null}
                      <Button
                        variant="secondary"
                        disabled={!teamEmails?.length}
                        onClick={() => add(teamEmails as string[])}
                      >
                        Add everyone in this team
                      </Button>
                    </>
                  )
                }
              </Loaded>
            ),
          },
          {
            id: 'people',
            label: 'People',
            panel: (
              <>
                <PeoplePicker
                  label="Search by name or email"
                  value={shown}
                  search={findPeople}
                  onChange={(next) => {
                    const kept = new Set(next.map((p) => p.email));
                    const dropped = shown.filter((p) => !kept.has(p.email));
                    setPicked(next);
                    setEmails([
                      ...new Set([
                        ...emails.filter((e) => !dropped.some((p) => p.email === e)),
                        ...next.map((p) => p.email),
                      ]),
                    ]);
                  }}
                />
                <p className="console-muted">
                  Or paste a list into the box above: commas, spaces or new lines all work.
                </p>
                <div
                  className={
                    dragging ? 'console-dropzone console-dropzone--over' : 'console-dropzone'
                  }
                >
                  <p>Drop a CSV file here, or choose one.</p>
                  <Input
                    label="CSV file (emails in the first column)"
                    type="file"
                    accept=".csv,text/csv"
                    onDragEnter={() => setDragging(true)}
                    onDragLeave={() => setDragging(false)}
                    onDrop={() => setDragging(false)}
                    onChange={(e) => void readCsv(e.target.files?.[0])}
                  />
                </div>
              </>
            ),
          },
          {
            id: 'new',
            label: 'New team',
            panel: (
              <>
                <Input
                  label="New team name"
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                />
                <p className="console-muted">
                  Add the members above. On Assign they are saved as this team, and the team appears
                  on the Teams page. Leave the name empty to skip it.
                </p>
              </>
            ),
          },
        ]}
      />
    </>
  );

  const scheduleStep = (
    <>
      <Input label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
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
        label={`Email ${t.learners} now`}
        checked={notify}
        onChange={(e) => setNotify(e.target.checked)}
      />
    </>
  );

  const reviewStep = (
    <>
      <p className="console-sentence">
        Assign <strong>{chosenTitles}</strong> to <strong>{peopleLabel(assignable)}</strong>
        {due ? (
          <>
            , due <strong>{due}</strong>
          </>
        ) : (
          ' with no deadline'
        )}
        {newTeam.trim() ? <>, and save them as the team {newTeam.trim()}</> : null}.
      </p>
      <dl>
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
      {courseIds.length > 1 ? (
        <ul aria-label="Per course">
          {courses
            .filter((c) => courseIds.includes(c.id))
            .map((c) => {
              const per = summarize(
                classifyEmails(emails, {
                  signedIn: known.signedIn,
                  assigned: known.byCourse[c.id] ?? new Set(),
                }),
              );
              return (
                <li key={c.id}>
                  {c.title}: {per.signedIn + per.newInvites} new, {per.alreadyAssigned} already
                  assigned
                </li>
              );
            })}
        </ul>
      ) : null}
      {summary.rejected.length > 0 ? (
        <ul aria-label="Rejected addresses">
          {summary.rejected.map((r) => (
            <li key={r.email}>
              {r.email}: {r.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {failed.length > 0 ? (
        <div role="alert" className="console-flow">
          <p>These could not be saved:</p>
          <ul aria-label="Failed assignments">
            {failed.map((f) => (
              <li key={`${f.courseId}:${f.email}`}>
                {f.email}: {titleOf(f.courseId)}
              </li>
            ))}
          </ul>
          <Button variant="secondary" disabled={busy} onClick={() => void retry()}>
            Retry
          </Button>
        </div>
      ) : null}
      <p className="console-muted">
        People who have not signed in yet are invited: the course appears the first time they sign
        in with their NonStop account.
      </p>
      <div className="console-flow-back">
        <Button variant="ghost" size="sm" onClick={() => go(0)}>
          Change courses
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(1)}>
          Change people
        </Button>
        <Button variant="ghost" size="sm" onClick={() => go(2)}>
          Change schedule
        </Button>
      </div>
    </>
  );

  const bodies = [courseStep, audienceStep, scheduleStep, reviewStep];
  const last = step === STEPS.length - 1;

  return (
    <Page>
      <PageHeader
        eyebrow={t.Admin}
        title="Assign courses"
        lead="Pick courses, pick people, set a deadline, then check it. Nothing is assigned until the last step."
      />
      {done ? (
        <div className="console-done" role="status">
          <SuccessCheck />
          <h2 tabIndex={-1} className="console-step-title">
            Assigned to {peopleLabel(done.people)}
          </h2>
          <p>
            {done.pending} pending {done.pending === 1 ? 'invite' : 'invites'}: those people see the
            course the first time they sign in.
          </p>
          <div className="console-flow-nav">
            <Link
              className={buttonClass('primary')}
              to={
                done.courses.length === 1
                  ? `/admin/learners?course=${encodeURIComponent(done.courses[0] as string)}`
                  : '/admin/learners'
              }
            >
              View learners
            </Link>
            <Button variant="secondary" onClick={reset}>
              Assign more
            </Button>
          </div>
        </div>
      ) : (
        <div className="console-flow">
          <FlowSteps steps={STEPS} current={step} label="Assign progress" />
          <FlowPanel key={step} direction={direction} className="console-flow">
            <h2 ref={headingRef} tabIndex={-1} className="console-step-title">
              {HEADINGS[step]}
            </h2>
            {bodies[step]}
            {problem ? (
              <p ref={problemRef} tabIndex={-1} role="alert" className="console-problem">
                {problem.message}
              </p>
            ) : null}
          </FlowPanel>
          <div className="console-flow-nav">
            {step > 0 ? (
              <Button variant="secondary" onClick={() => go(step - 1)}>
                Back
              </Button>
            ) : (
              <span />
            )}
            {last ? (
              <Button disabled={assignable === 0} loading={busy} onClick={() => void submit()}>
                Assign to {peopleLabel(assignable)}
              </Button>
            ) : (
              <Button disabled={step === 0 && courseList.state !== 'ready'} onClick={next}>
                Next
              </Button>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

import { classifyEmails, summarize } from '@gurukul/schema';
import type { ClassifiedEmail, Reminder, Team } from '@gurukul/schema';
import {
  Button,
  EmptyState,
  FlowPanel,
  FlowSteps,
  Input,
  Page,
  PageHeader,
  Select,
  SuccessCheck,
  Toggle,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { toastError } from '../errors';
import { AudienceStep } from './AudienceStep';
import type { AudienceMode } from './AudienceStep';
import { CourseChoice } from './CourseChoice';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import type { Loadable } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import type { AssignResult, KnownEmails } from './types';

const peopleLabel = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

const NO_TEAMS: Team[] = [];
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
  const [mode, setMode] = useState<AudienceMode>(prefill.emails?.length ? 'people' : 'teams');
  const [teamNames, setTeamNames] = useState<string[]>([]);
  // Each picked team's members, by team name: the people listed on it and anyone whose profile
  // says they are on it.
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [madeTeams, setMadeTeams] = useState<Team[]>([]);
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
  const loadedTeams = teamList.state === 'ready' ? teamList.value : NO_TEAMS;
  const teams = [...loadedTeams, ...madeTeams];
  const teamsLoadable: Loadable<Team[]> =
    teamList.state === 'ready' ? { state: 'ready', value: teams } : teamList;
  // Who would be assigned: the people picked, or everyone on the teams picked.
  const recipients =
    mode === 'teams' ? [...new Set(teamNames.flatMap((n) => members[n] ?? []))] : emails;
  const counting = mode === 'teams' && teamNames.some((n) => !(n in members));

  useEffect(() => {
    let live = true;
    void data.knownEmails(recipients, courseIds).then((k) => live && setKnown(k));
    return () => {
      live = false;
    };
    // `recipients` is rebuilt every render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, recipients.join(','), courseIds]);

  // A team that was just picked has its members read once; the answer is kept by team name.
  useEffect(() => {
    for (const name of teamNames) {
      if (name in members) continue;
      void data.usersInTeam(name).then((rows) => {
        const listed = (teams.find((x) => x.name === name) as Team).memberEmails;
        setMembers((m) => ({
          ...m,
          [name]: [...new Set([...listed, ...rows.map((u) => u.email)])],
        }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, teamNames]);

  // Each step's heading takes focus when the step changes; a problem takes it when one is shown.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step]);
  useEffect(() => {
    if (problem) problemRef.current?.focus();
  }, [problem]);

  const classify = (email: string) => classifyEmails([email], known)[0] as ClassifiedEmail;
  const classified = classifyEmails(recipients, known);
  const summary = summarize(classified);
  const assignable = summary.signedIn + summary.newInvites;
  const changeMode = (next: AudienceMode) => {
    setMode(next);
    setTeamNames([]);
    setEmails([]);
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
    if (counting) return 'Counting the people on your teams. Try again in a moment.';
    if (assignable > 0) return null;
    return mode === 'teams'
      ? 'Pick at least one team that has people who can be assigned.'
      : 'Pick at least one person who can be assigned.';
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
      finish([await send(courseIds, recipients)]);
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
    setTeamNames([]);
    setDue('');
    setStep(0);
    setDirection('back');
  };

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
    <AudienceStep
      data={data}
      mode={mode}
      onMode={changeMode}
      teamList={teamsLoadable}
      onTeamCreated={(team) => setMadeTeams((m) => [...m, team])}
      teamNames={teamNames}
      onTeamNames={setTeamNames}
      emails={emails}
      onEmails={setEmails}
      classify={classify}
      summary={
        counting
          ? 'Counting the people on your teams…'
          : `${peopleLabel(assignable)} will be assigned.${
              mode === 'teams' && teamNames.length > 0
                ? ` From ${teamNames.length} ${teamNames.length === 1 ? 'team' : 'teams'}: ${teamNames.join(', ')}.`
                : ''
            }`
      }
    />
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
        {mode === 'teams' && teamNames.length > 0 ? <>, from {teamNames.join(', ')}</> : null}.
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
                classifyEmails(recipients, {
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

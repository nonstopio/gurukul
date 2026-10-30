import {
  Button,
  Card,
  Chip,
  EmptyState,
  Page,
  PageHeader,
  ProgressBar,
  buttonClass,
} from '@gurukul/ui';
import { resumeItemId } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import {
  ASSIGNED_PREVIEW,
  LEVEL_LABELS,
  agoLabel,
  continueCourse,
  dueLabel,
  firstName,
  hasNewLessons,
  isRetired,
  orderAssigned,
  percentFor,
  recentActivity,
  statusLine,
  upNext,
} from './learn/model';
import type { AssignedCourse } from './learn/model';
import { TeamPrompt } from './learn/TeamPrompt';
import { CoverTile, Loaded } from './learn/ui';
import { useTerms } from './labels/useTerms';

/** Learner Home: continue where you left off, what is assigned and due, or the catalogue. */
export function HomePage({ now = () => new Date() }: { now?: () => Date }) {
  const [showAll, setShowAll] = useState(false);
  const user = useUser();
  const { team } = useSession();
  const data = useLearnerData();
  const uid = user.uid;
  const load = useCallback(async () => {
    const [assignments, progress, courses, certificates] = await Promise.all([
      data.myAssignments(uid),
      data.myProgress(uid),
      data.listCourses(),
      data.myCertificates(uid),
    ]);
    const assigned: AssignedCourse[] = assignments.flatMap((assignment) => {
      const course = courses.find((c) => c.id === assignment.courseId);
      return course
        ? [{ assignment, course, progress: progress.find((p) => p.courseId === course.id) ?? null }]
        : [];
    });
    return {
      assigned: orderAssigned(assigned),
      courses,
      current: continueCourse(courses, progress),
      activity: recentActivity(courses, progress, certificates),
    };
  }, [data, uid]);
  const result = useAsync(load);
  const name = firstName(user.displayName);
  const t = useTerms();
  const current = result.state === 'ready' ? result.value.current : null;

  return (
    <Page>
      <PageHeader
        eyebrow={`${t.Learner} · My learning`}
        title={name ? `Namaste, ${name}` : 'Namaste'}
        lead={current ? statusLine(current.course, current.progress, t) : undefined}
      />
      {team === null ? <TeamPrompt /> : null}
      <Loaded loadable={result}>
        {({ assigned, courses, activity }) => {
          const next = assigned.find((a) => a.progress === null);
          const currentAssignment = current
            ? assigned.find((a) => a.course.id === current.course.id)?.assignment
            : undefined;
          const currentDue = currentAssignment?.dueAt
            ? dueLabel(currentAssignment.dueAt, now())
            : null;
          const upcoming = current ? upNext(current.course, current.progress) : null;
          const shown = showAll ? assigned : assigned.slice(0, ASSIGNED_PREVIEW);
          return (
            <>
              {current ? (
                <Card title="Continue learning">
                  <div className="continue">
                    <CoverTile cover={current.course.cover} size="large" />
                    <div className="learn-stack">
                      <span className="learn-chips">
                        <Chip tone="accent">In progress</Chip>
                        <Chip tone="neutral">{LEVEL_LABELS[current.course.level]}</Chip>
                        {currentDue ? (
                          <Chip tone={currentDue.overdue ? 'danger' : 'warning'}>
                            {currentDue.text}
                          </Chip>
                        ) : null}
                        {isRetired(current.course) ? <Chip tone="warning">Retired</Chip> : null}
                      </span>
                      <h3 className="learn-display">{current.course.title}</h3>
                      {currentAssignment?.assignedByName ? (
                        <p className="learn-muted">
                          Assigned by {currentAssignment.assignedByName}
                        </p>
                      ) : null}
                      {upcoming ? (
                        <p className="learn-muted">Up next: {upcoming.item.title}</p>
                      ) : null}
                      <ProgressBar
                        value={percentFor(current.course, current.progress)}
                        label="Course progress"
                      />
                      <div className="learn-buttons">
                        <Link
                          className={buttonClass('primary')}
                          to={`/courses/${current.course.id}/learn/${resumeItemId(current.course, current.progress) ?? ''}`}
                        >
                          Resume lesson
                        </Link>
                        <Link
                          className={buttonClass('secondary')}
                          to={`/courses/${current.course.id}`}
                        >
                          Course outline
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : next ? (
                <Card title="Continue learning">
                  <div className="continue">
                    <CoverTile cover={next.course.cover} size="large" />
                    <div className="learn-stack">
                      <h3 className="learn-display">Start {next.course.title}</h3>
                      <p className="learn-muted">{next.course.summary}</p>
                      <div className="learn-buttons">
                        <Link className={buttonClass('primary')} to={`/courses/${next.course.id}`}>
                          Start course
                        </Link>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : null}

              {assigned.length > 0 || activity.length > 0 ? (
                <div className="home-columns">
                  {assigned.length > 0 ? (
                    <Card
                      title="Assigned to you"
                      actions={
                        assigned.length > ASSIGNED_PREVIEW ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={showAll}
                            onClick={() => setShowAll(!showAll)}
                          >
                            {showAll ? 'Show fewer' : `Show all ${assigned.length}`}
                          </Button>
                        ) : undefined
                      }
                    >
                      <ul className="learn-rows">
                        {shown.map(({ assignment, course, progress: p }) => {
                          const due = assignment.dueAt ? dueLabel(assignment.dueAt, now()) : null;
                          return (
                            <li key={assignment.id}>
                              <Link to={`/courses/${course.id}`} className="course-row">
                                <CoverTile cover={course.cover} size="small" />
                                <span className="learn-stack">
                                  <span className="course-row__title">{course.title}</span>
                                  <ProgressBar
                                    value={percentFor(course, p)}
                                    label={`${course.title} progress`}
                                  />
                                  <span className="learn-chips">
                                    {isRetired(course) ? <Chip tone="warning">Retired</Chip> : null}
                                    {assignment.mandatory ? (
                                      <Chip tone="neutral">Mandatory</Chip>
                                    ) : null}
                                    {due ? (
                                      <Chip tone={due.overdue ? 'danger' : 'warning'}>
                                        {due.text}
                                      </Chip>
                                    ) : null}
                                    {assignment.status === 'completed' ? (
                                      <Chip tone="solid">Completed</Chip>
                                    ) : null}
                                    {hasNewLessons(course, p) ? (
                                      <Chip tone="info">New lessons added</Chip>
                                    ) : null}
                                  </span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  ) : null}

                  {activity.length > 0 ? (
                    <Card title="Recent activity">
                      <ol className="learn-rows">
                        {activity.map((event) => (
                          <li key={event.id} className="activity-row">
                            <span>{event.text}</span>
                            <span className="learn-muted">{agoLabel(event.at, now())}</span>
                          </li>
                        ))}
                      </ol>
                    </Card>
                  ) : null}
                </div>
              ) : null}

              {!current && assigned.length === 0 ? (
                <EmptyState
                  title="Nothing assigned yet"
                  headingAs="h2"
                  action={
                    <Link className={buttonClass('secondary')} to="/courses">
                      Browse the catalogue
                    </Link>
                  }
                >
                  {courses.length > 0
                    ? 'Every published course is open to you. Pick one to start.'
                    : 'Courses will appear here once they are published.'}
                </EmptyState>
              ) : null}
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}

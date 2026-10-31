import {
  Button,
  Card,
  Chip,
  CourseTile,
  EmptyState,
  Page,
  PageHeader,
  ProgressBar,
  buttonClass,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import {
  ASSIGNED_PREVIEW,
  agoLabel,
  continueCourse,
  dueLabel,
  firstName,
  hasNewLessons,
  isRetired,
  nextAssigned,
  orderAssigned,
  percentFor,
  recentActivity,
  statusLine,
  courseImageUrl,
} from './learn/model';
import type { AssignedCourse } from './learn/model';
import { suggestions } from './learn/hero';
import { HomeContinue, PickNextCourse } from './learn/HomeContinue';
import { TeamPrompt } from './learn/TeamPrompt';
import { Loaded } from './learn/ui';
import { useTerms } from './labels/useTerms';
import { useAudience } from './data/useAudience';

/** Learner Home: continue where you left off, what is assigned and due, or the catalogue. */
export function HomePage({ now = () => new Date() }: { now?: () => Date }) {
  const [showAll, setShowAll] = useState(false);
  const user = useUser();
  const { team } = useSession();
  const data = useLearnerData();
  const uid = user.uid;
  const audience = useAudience();
  const load = useCallback(async () => {
    const [assignments, progress, courses, certificates] = await Promise.all([
      data.myAssignments(uid),
      data.myProgress(uid),
      data.listCourses(audience),
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
      progress,
      current: continueCourse(courses, progress),
      activity: recentActivity(courses, progress, certificates),
    };
  }, [data, uid, audience]);
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
        {({ assigned, courses, progress, activity }) => {
          const currentAssignment = current
            ? assigned.find((a) => a.course.id === current.course.id)?.assignment
            : undefined;
          const dueOf = (a: { dueAt: Date | null } | undefined) =>
            a?.dueAt ? dueLabel(a.dueAt, now()) : null;
          const queued = current ? nextAssigned(assigned, current.course.id) : null;
          const shown = showAll ? assigned : assigned.slice(0, ASSIGNED_PREVIEW);
          const picks = suggestions(courses, assigned, progress);
          return (
            <>
              {current ? (
                <HomeContinue
                  course={current.course}
                  progress={current.progress}
                  percent={percentFor(current.course, current.progress)}
                  due={dueOf(currentAssignment)}
                  assignedBy={currentAssignment?.assignedByName ?? null}
                  next={queued}
                  nextDue={dueOf(queued?.assignment)}
                />
              ) : picks.length > 0 ? (
                <PickNextCourse
                  courses={picks}
                  dueOf={(id) =>
                    dueOf(assigned.find((a) => a.course.id === id)?.assignment)?.text ?? null
                  }
                />
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
                      <ul className="learn-cards g-stagger">
                        {shown.map(({ assignment, course, progress: p }, i) => {
                          const due =
                            assignment.dueAt && assignment.status !== 'completed'
                              ? dueLabel(assignment.dueAt, now())
                              : null;
                          return (
                            <CourseTile
                              as="li"
                              key={assignment.id}
                              title={course.title}
                              heading={<Link to={`/courses/${course.id}`}>{course.title}</Link>}
                              image={courseImageUrl(course)}
                              theme={course.cover.theme}
                              style={{ '--i': i } as CSSProperties}
                              chips={
                                <>
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
                                </>
                              }
                              extra={
                                <ProgressBar
                                  value={percentFor(course, p)}
                                  label={`${course.title} progress`}
                                />
                              }
                            />
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

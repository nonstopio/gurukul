import { Card, Chip, EmptyState, ProgressBar, buttonClass } from '@gurukul/ui';
import { resumeItemId } from '@gurukul/schema';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import {
  continueCourse,
  dueLabel,
  firstName,
  hasNewLessons,
  isRetired,
  orderAssigned,
  percentFor,
} from './learn/model';
import type { AssignedCourse } from './learn/model';
import { TeamPrompt } from './learn/TeamPrompt';
import { Loaded } from './learn/ui';

/** Learner Home: continue where you left off, what is assigned and due, or the catalogue. */
export function HomePage({ now = () => new Date() }: { now?: () => Date }) {
  const user = useUser();
  const { team } = useSession();
  const data = useLearnerData();
  const uid = user.uid;
  const load = useCallback(async () => {
    const [assignments, progress, courses] = await Promise.all([
      data.myAssignments(uid),
      data.myProgress(uid),
      data.listCourses(),
    ]);
    const assigned: AssignedCourse[] = assignments.flatMap((assignment) => {
      const course = courses.find((c) => c.id === assignment.courseId);
      return course
        ? [{ assignment, course, progress: progress.find((p) => p.courseId === course.id) ?? null }]
        : [];
    });
    return { assigned: orderAssigned(assigned), courses, progress };
  }, [data, uid]);
  const result = useAsync(load);
  const name = firstName(user.displayName);

  return (
    <main className="page">
      <h1 className="page__title">{name ? `Namaste, ${name}` : 'Namaste'}</h1>
      {team === null ? <TeamPrompt /> : null}
      <Loaded loadable={result}>
        {({ assigned, courses, progress }) => {
          const current = continueCourse(courses, progress);
          const next = assigned.find((a) => a.progress === null);
          return (
            <>
              {current ? (
                <Card
                  as="section"
                  highlighted
                  aria-labelledby="continue-title"
                  className="continue"
                >
                  <span className="continue__chips">
                    <Chip tone="accent">In progress</Chip>
                    {isRetired(current.course) ? <Chip tone="warning">Retired</Chip> : null}
                  </span>
                  <h2 id="continue-title" className="continue__title">
                    {current.course.title}
                  </h2>
                  <ProgressBar
                    value={percentFor(current.course, current.progress)}
                    label={`${current.course.title} progress`}
                  />
                  <div className="continue__actions">
                    <Link
                      className={buttonClass('primary')}
                      to={`/courses/${current.course.id}/learn/${resumeItemId(current.course, current.progress) ?? ''}`}
                    >
                      Resume lesson
                    </Link>
                    <Link className={buttonClass('secondary')} to={`/courses/${current.course.id}`}>
                      Course outline
                    </Link>
                  </div>
                </Card>
              ) : next ? (
                <Card
                  as="section"
                  highlighted
                  aria-labelledby="continue-title"
                  className="continue"
                >
                  <h2 id="continue-title" className="continue__title">
                    Start {next.course.title}
                  </h2>
                  <p>{next.course.summary}</p>
                  <Link className={buttonClass('primary')} to={`/courses/${next.course.id}`}>
                    Start course
                  </Link>
                </Card>
              ) : null}

              {assigned.length > 0 ? (
                <section aria-labelledby="assigned-title" className="home-section">
                  <h2 id="assigned-title">Assigned to you</h2>
                  <ul className="course-list">
                    {assigned.map(({ assignment, course, progress: p }) => {
                      const due = assignment.dueAt ? dueLabel(assignment.dueAt, now()) : null;
                      return (
                        <li key={assignment.id}>
                          <Link to={`/courses/${course.id}`} className="course-row">
                            <span className="course-row__title">{course.title}</span>
                            <ProgressBar
                              value={percentFor(course, p)}
                              label={`${course.title} progress`}
                            />
                            <span className="course-row__meta">
                              {isRetired(course) ? <Chip tone="warning">Retired</Chip> : null}
                              {assignment.mandatory ? <Chip tone="neutral">Mandatory</Chip> : null}
                              {due ? (
                                <Chip tone={due.overdue ? 'danger' : 'warning'}>{due.text}</Chip>
                              ) : null}
                              {assignment.status === 'completed' ? (
                                <Chip tone="solid">Completed</Chip>
                              ) : null}
                              {hasNewLessons(course, p) ? (
                                <Chip tone="info">New lessons added</Chip>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {!current && assigned.length === 0 ? (
                <EmptyState
                  title="Nothing assigned yet"
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
    </main>
  );
}

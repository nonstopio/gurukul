import { Card, Chip, ProgressRing, buttonClass } from '@gurukul/ui';
import { resumeItemId } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ProgressRow } from '../data/types';
import { LEVEL_LABELS, durationLabel, isRetired, upNext } from './model';
import type { AssignedCourse } from './model';
import { minutesLeft } from './hero';

const SEEN = 'gurukul.ring.';

/** The percent last shown for a course in this browser, so the ring can grow from it. */
function previousPercent(courseId: string): number | null {
  try {
    const raw = window.localStorage.getItem(SEEN + courseId);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/**
 * A value that starts at what this browser last showed for `courseId` (0 the first time) and moves
 * to `percent` once drawn, so the ring animates from where it was. Reduced motion has no
 * transition, so the ring simply shows the new value.
 */
export function useAnimatedPercent(courseId: string, percent: number): number {
  const [shown, setShown] = useState(() => previousPercent(courseId) ?? 0);
  useEffect(() => {
    // A frame later, so the ring is drawn at the old value first and the transition has a start.
    const frame = requestAnimationFrame(() => setShown(percent));
    try {
      window.localStorage.setItem(SEEN + courseId, String(percent));
    } catch {
      // Private windows can refuse storage; the ring still works.
    }
    return () => cancelAnimationFrame(frame);
  }, [courseId, percent]);
  return shown;
}

/**
 * The home hero: the one course the person is in, with a progress ring, the next lesson and its
 * length, the time left, one Resume button and, when something else is due, a row for it.
 */
export function HomeContinue({
  course,
  progress,
  percent,
  due,
  assignedBy,
  next,
  nextDue,
}: {
  course: Course;
  progress: ProgressRow;
  percent: number;
  /** The course's due date in words, when it has one. */
  due: { text: string; overdue: boolean } | null;
  assignedBy: string | null;
  /** The next course in the person's queue, if any. */
  next: AssignedCourse | null;
  nextDue: { text: string; overdue: boolean } | null;
}) {
  const ring = useAnimatedPercent(course.id, percent);
  const upcoming = upNext(course, progress);
  const left = minutesLeft(course, progress);
  const lesson = upcoming?.item.type === 'lesson' ? upcoming.item : null;
  return (
    <Card title="Continue learning">
      <div className="hero">
        <ProgressRing value={ring} label="Course progress" size={96} stroke={8} />
        <div className="learn-stack">
          <span className="learn-chips">
            <Chip tone="accent">In progress</Chip>
            <Chip tone="neutral">{LEVEL_LABELS[course.level]}</Chip>
            {due ? <Chip tone={due.overdue ? 'danger' : 'warning'}>{due.text}</Chip> : null}
            {isRetired(course) ? <Chip tone="warning">Retired</Chip> : null}
          </span>
          <h3 className="learn-display">{course.title}</h3>
          {upcoming ? (
            <p>
              Next {lesson ? 'lesson' : 'item'}: <strong>{upcoming.item.title}</strong>
              {lesson ? ` · ${durationLabel(lesson.minutes)}` : null}
            </p>
          ) : null}
          <p className="learn-muted">
            <span>{left > 0 ? `${durationLabel(left)} left` : 'Nothing left but the Quizzes'}</span>
            {assignedBy ? <span>{` · Assigned by ${assignedBy}`}</span> : null}
          </p>
          <div className="learn-buttons">
            <Link
              className={buttonClass('primary')}
              to={`/courses/${course.id}/learn/${resumeItemId(course, progress) ?? ''}`}
            >
              Resume lesson
            </Link>
          </div>
        </div>
      </div>
      {next ? (
        <p className="hero__next">
          <span className="learn-muted">Up next:</span>{' '}
          <Link to={`/courses/${next.course.id}`}>{next.course.title}</Link>
          {nextDue ? (
            <>
              {' '}
              <Chip tone={nextDue.overdue ? 'danger' : 'warning'}>{nextDue.text}</Chip>
            </>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}

/** With nothing in progress: up to three courses to start, the assigned ones first. */
export function PickNextCourse({
  courses,
  dueOf,
}: {
  courses: Course[];
  dueOf: (id: string) => string | null;
}) {
  return (
    <Card title="Pick your next course">
      <ul className="learn-rows">
        {courses.map((c) => (
          <li key={c.id}>
            <Link to={`/courses/${c.id}`} className="course-row">
              <span className="learn-stack">
                <span className="course-row__title">{`Start ${c.title}`}</span>
                <span className="learn-muted">{c.summary}</span>
                <span className="learn-chips">
                  <Chip tone="neutral">{LEVEL_LABELS[c.level]}</Chip>
                  <Chip tone="neutral">{durationLabel(c.estimatedMinutes)}</Chip>
                  {dueOf(c.id) ? <Chip tone="warning">{dueOf(c.id)}</Chip> : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

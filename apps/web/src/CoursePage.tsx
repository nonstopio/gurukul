import { itemStates, itemsOf, resumeItemId } from '@gurukul/schema';
import type { Course, ItemState } from '@gurukul/schema';
import {
  Breadcrumb,
  Callout,
  Card,
  Chip,
  EmptyState,
  ProgressRing,
  buttonClass,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import type { ProgressRow } from './data/types';
import { useAsync } from './data/useAsync';
import { countItems, dueLabel, hasNewLessons, isRetired, percentFor } from './learn/model';
import { itemPath } from './quiz/model';
import { Loaded, RetiredNote } from './learn/ui';
import { openChaptersKey, readOpenChapters, writeOpenChapters } from './learn/openChapters';
import { Prose } from './player/blocks';
import { useTerms } from './labels/useTerms';

const NO_PROGRESS = { completedItemIds: [], quiz: {}, lastItemId: null };

const STATE_LABEL: Record<ItemState, string> = {
  done: 'Done',
  current: 'Up next',
  todo: '',
  locked: 'Locked',
};

/** A course's overview: description, outcomes, the outline with per-item state, and Resume. */
export function CoursePage({ now = () => new Date() }: { now?: () => Date }) {
  const { courseId = '' } = useParams();
  const data = useLearnerData();
  const uid = useUser().uid;
  const [progress, setProgress] = useState<ProgressRow | null>(null);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);
  // The due date is a nicety: if assignments fail to load the overview still opens without it.
  const assignments = useAsync(
    useCallback(() => data.myAssignments(uid).catch(() => []), [data, uid]),
  );
  const dueAt =
    assignments.state === 'ready'
      ? (assignments.value.find((a) => a.courseId === courseId)?.dueAt ?? null)
      : null;

  return (
    <Loaded loadable={result}>
      {(course) =>
        course ? (
          <Overview course={course} progress={progress} uid={uid} dueAt={dueAt} now={now} />
        ) : (
          <main className="page">
            <EmptyState
              title="This course does not exist"
              action={
                <Link className={buttonClass('secondary')} to="/courses">
                  Browse the catalogue
                </Link>
              }
            >
              It may have been removed, or the address is wrong.
            </EmptyState>
          </main>
        )
      }
    </Loaded>
  );
}

/** The Quiz that gates a locked item: the nearest earlier one that blocks what follows. */
function unlockHint(course: Course, itemId: string): string {
  const items = itemsOf(course);
  const at = items.findIndex((i) => i.id === itemId);
  const gate = items
    .slice(0, at)
    .reverse()
    .find((i) => i.type === 'quiz' && i.blocksNext);
  return gate ? `Pass ${gate.title} to unlock` : 'Finish the earlier lessons to unlock';
}

function Overview({
  course,
  progress,
  uid,
  dueAt,
  now,
}: {
  course: Course;
  progress: ProgressRow | null;
  uid: string;
  dueAt: Date | null;
  now: () => Date;
}) {
  const state = progress ?? NO_PROGRESS;
  const states = itemStates(course, state);
  const resume = resumeItemId(course, state);
  const resumeTitle = itemsOf(course).find((i) => i.id === resume)?.title;
  const counts = countItems(course);
  const percent = percentFor(course, progress);
  const currentChapter = course.chapters.find((p) =>
    p.items.some((i) => states[i.id] === 'current'),
  );
  const storeKey = openChaptersKey(uid, course.id);
  const [open, setOpen] = useState(() => readOpenChapters(storeKey));
  const toggle = (id: string, expanded: boolean) => {
    const next = { ...open, [id]: !expanded };
    setOpen(next);
    writeOpenChapters(storeKey, next);
  };
  const educators = Object.values(course.educatorNames);
  const t = useTerms();
  const due = dueAt
    ? {
        ...dueLabel(dueAt, now()),
        date: dueAt.toLocaleDateString('en-IN', { dateStyle: 'medium' }),
      }
    : null;
  const isOpen = (id: string) => open[id] ?? id === currentChapter?.id;

  return (
    <main>
      <div className="page course__crumb">
        <Breadcrumb
          items={[
            { label: 'Catalogue', render: (p) => <Link to="/courses" {...(p as object)} /> },
            { label: course.title },
          ]}
        />
      </div>
      <header className="course-hero">
        <div className="course-hero__inner">
          <h1 className="course-hero__title">{course.title}</h1>
          <p className="course-hero__summary">{course.summary}</p>
          <p className="course-hero__meta">
            {course.chapters.length} {t.chapters} · {counts.lessons} lessons · {counts.quizzes}{' '}
            {t.Quizzes}· {course.estimatedMinutes} min
            {course.rules.certificate ? ' · Certificate' : ''}
            {isRetired(course) ? ' · Retired' : ''}
          </p>
          {due ? (
            <p className="course-hero__due">
              <Chip tone={due.overdue ? 'danger' : 'warning'}>{due.text}</Chip>
              <span className="course-hero__due-date">{due.date}</span>
            </p>
          ) : null}
          <div className="course-hero__actions">
            {resume ? (
              <Link className={buttonClass('chrome')} to={`/courses/${course.id}/learn/${resume}`}>
                {progress ? `Resume — ${resumeTitle}` : 'Start course'}
              </Link>
            ) : null}
            {progress?.certificateId ? (
              <Link
                className={buttonClass('secondary')}
                to={`/certificates/${progress.certificateId}`}
              >
                View your certificate
              </Link>
            ) : null}
          </div>
        </div>
      </header>
      <div className="page course__body">
        {course.description.trim() && course.description !== course.summary ? (
          <Prose md={course.description} />
        ) : null}
        {isRetired(course) ? <RetiredNote /> : null}
        {hasNewLessons(course, progress) ? (
          <Callout tone="note" title="New lessons added">
            <p>
              This course has grown since you finished it. Your certificate stays; the new lessons
              are there whenever you want them.
            </p>
          </Callout>
        ) : null}

        <div className="course__layout">
          <section aria-labelledby="outline-title">
            <h2 id="outline-title">Outline</h2>
            {course.chapters.map((chapter, n) => {
              const expanded = isOpen(chapter.id);
              const done = chapter.items.filter((i) => states[i.id] === 'done').length;
              return (
                <Card as="section" key={chapter.id} className="chapter">
                  <h3 className="chapter__title">
                    <button
                      type="button"
                      className="chapter__toggle"
                      aria-expanded={expanded}
                      aria-controls={`chapter-${chapter.id}`}
                      onClick={() => toggle(chapter.id, expanded)}
                    >
                      <span className="chapter__label">
                        {t.Chapter} {n + 1}
                      </span>{' '}
                      {chapter.title}
                      <span className="chapter__count">
                        {done}/{chapter.items.length}
                      </span>
                    </button>
                  </h3>
                  {expanded ? (
                    <ul id={`chapter-${chapter.id}`} className="items">
                      {chapter.items.map((item) => {
                        const s = states[item.id] as ItemState;
                        const label = (
                          <>
                            <span>{item.title}</span>
                            <span className="items__kind">
                              {item.type === 'lesson' ? `${item.minutes} min` : t.Quiz}
                            </span>
                            {STATE_LABEL[s] ? (
                              <Chip tone={s === 'done' ? 'accent' : 'neutral'}>
                                {STATE_LABEL[s]}
                              </Chip>
                            ) : null}
                          </>
                        );
                        return (
                          <li key={item.id}>
                            {s === 'locked' ? (
                              <span
                                className="items__row"
                                aria-disabled="true"
                                title={unlockHint(course, item.id)}
                              >
                                {label}
                              </span>
                            ) : (
                              <Link className="items__row" to={itemPath(course.id, item)}>
                                {label}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </Card>
              );
            })}
          </section>
          <aside aria-label="Your progress">
            <Card>
              <ProgressRing value={percent} label={`${course.title} progress`} size={96} />
              <dl className="course__stats">
                <dt>Lessons</dt>
                <dd>{counts.lessons}</dd>
                <dt>{t.Quizzes}</dt>
                <dd>{counts.quizzes}</dd>
              </dl>
              <p>
                Pass mark {Math.round(course.rules.passMark * 100)}% on each {t.Quiz}.
              </p>
            </Card>
            {educators.length > 0 ? (
              <Card as="section" aria-labelledby="educator-title">
                <h2 id="educator-title">
                  {`Your ${educators.length === 1 ? t.Educator : t.Educators}`}
                </h2>
                <ul>
                  {educators.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {course.outcomes.length > 0 ? (
              <Card as="section" aria-labelledby="learn-title">
                <h2 id="learn-title">What you will learn</h2>
                <ul>
                  {course.outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </main>
  );
}

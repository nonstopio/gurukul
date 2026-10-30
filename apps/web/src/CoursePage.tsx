import { itemStates, itemsOf, resumeItemId } from '@gurukul/schema';
import type { Course, ItemState } from '@gurukul/schema';
import {
  Breadcrumb,
  Callout,
  Card,
  Chip,
  EmptyState,
  Page,
  PageHeader,
  ProgressRing,
  buttonClass,
} from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import type { ProgressRow } from './data/types';
import { useAsync } from './data/useAsync';
import {
  LEVEL_LABELS,
  countItems,
  dueLabel,
  hasNewLessons,
  isRetired,
  percentFor,
} from './learn/model';
import { itemPath } from './quiz/model';
import { LoadedPage, RetiredNote } from './learn/ui';
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
    <LoadedPage loadable={result}>
      {(course) =>
        course ? (
          <Overview course={course} progress={progress} uid={uid} dueAt={dueAt} now={now} />
        ) : (
          <Page>
            <PageHeader title="Course not found" />
            <EmptyState
              title="This course does not exist"
              headingAs="h2"
              action={
                <Link className={buttonClass('secondary')} to="/courses">
                  Browse the catalogue
                </Link>
              }
            >
              It may have been removed, or the address is wrong.
            </EmptyState>
          </Page>
        )
      }
    </LoadedPage>
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
  const due = dueAt ? dueLabel(dueAt, now()) : null;
  const isOpen = (id: string) => open[id] ?? id === currentChapter?.id;

  const aside = (
    <>
      <Card title="Your progress">
        <div className="progress-summary">
          <ProgressRing value={percent} label={`${course.title} progress`} size={96} />
          <dl className="learn-terms">
            <dt>Lessons</dt>
            <dd>{counts.lessons}</dd>
            <dt>{t.Quizzes}</dt>
            <dd>{counts.quizzes}</dd>
          </dl>
        </div>
        <p className="learn-muted">
          Pass mark {Math.round(course.rules.passMark * 100)}% on each {t.Quiz}.
        </p>
      </Card>
      {course.outcomes.length > 0 ? (
        <Card title="What you will learn">
          <ul className="learn-bullets">
            {course.outcomes.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {educators.length > 0 ? (
        <Card title={`Your ${educators.length === 1 ? t.Educator : t.Educators}`}>
          <ul className="learn-bullets">
            {educators.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );

  return (
    <Page aside={aside}>
      <PageHeader
        breadcrumb={
          <Breadcrumb
            items={[
              { label: 'Catalogue', render: (p) => <Link to="/courses" {...(p as object)} /> },
              { label: course.title },
            ]}
          />
        }
        title={course.title}
        lead={course.summary}
        meta={
          <>
            <Chip tone="neutral">{LEVEL_LABELS[course.level]}</Chip>
            {isRetired(course) ? <Chip tone="warning">Retired</Chip> : null}
            {due ? <Chip tone={due.overdue ? 'danger' : 'warning'}>{due.text}</Chip> : null}
            <span className="learn-meta">
              {[
                `${course.chapters.length} ${t.chapters}`,
                `${counts.lessons} lessons`,
                `${counts.quizzes} ${t.Quizzes}`,
                `${course.estimatedMinutes} min`,
                ...(course.rules.certificate ? ['Certificate'] : []),
                ...(dueAt
                  ? [`Due ${dueAt.toLocaleDateString('en-IN', { dateStyle: 'medium' })}`]
                  : []),
              ].join(' · ')}
            </span>
          </>
        }
        actions={
          <>
            {progress?.certificateId ? (
              <Link
                className={buttonClass('secondary')}
                to={`/certificates/${progress.certificateId}`}
              >
                View your certificate
              </Link>
            ) : null}
            {resume ? (
              <Link className={buttonClass('primary')} to={`/courses/${course.id}/learn/${resume}`}>
                {progress ? `Resume — ${resumeTitle}` : 'Start course'}
              </Link>
            ) : null}
          </>
        }
      />
      {isRetired(course) ? <RetiredNote /> : null}
      {hasNewLessons(course, progress) ? (
        <Callout tone="note" title="New lessons added">
          <p>
            This course has grown since you finished it. Your certificate stays; the new lessons are
            there whenever you want them.
          </p>
        </Callout>
      ) : null}
      {course.description.trim() && course.description !== course.summary ? (
        <Card title="About this course">
          <Prose md={course.description} />
        </Card>
      ) : null}

      <Card title="Outline">
        <div className="learn-stack">
          {course.chapters.map((chapter, n) => {
            const expanded = isOpen(chapter.id);
            const done = chapter.items.filter((i) => states[i.id] === 'done').length;
            return (
              <Card
                key={chapter.id}
                highlighted={chapter.id === currentChapter?.id}
                className="chapter"
              >
                <h3 className="chapter__title">
                  <button
                    type="button"
                    className="chapter__toggle"
                    aria-expanded={expanded}
                    aria-controls={`chapter-${chapter.id}`}
                    onClick={() => toggle(chapter.id, expanded)}
                  >
                    <span className="learn-label">
                      {t.Chapter} {n + 1}
                    </span>{' '}
                    {chapter.title}
                    <span className="chapter__count">
                      {done}/{chapter.items.length}
                    </span>
                  </button>
                </h3>
                {expanded ? (
                  <ul id={`chapter-${chapter.id}`} className="learn-rows">
                    {chapter.items.map((item) => {
                      const s = states[item.id] as ItemState;
                      const label = (
                        <>
                          <span>{item.title}</span>
                          <span className="items__kind">
                            {item.type === 'lesson' ? `${item.minutes} min` : t.Quiz}
                          </span>
                          {STATE_LABEL[s] ? (
                            <Chip tone={s === 'done' ? 'accent' : 'neutral'}>{STATE_LABEL[s]}</Chip>
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
        </div>
      </Card>
    </Page>
  );
}

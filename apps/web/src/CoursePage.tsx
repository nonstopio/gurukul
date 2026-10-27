import { itemStates, itemsOf, resumeItemId } from '@gurukul/schema';
import type { Course, ItemState } from '@gurukul/schema';
import { Breadcrumb, Card, Chip, EmptyState, ProgressRing, buttonClass } from '@gurukul/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import type { ProgressRow } from './data/types';
import { useAsync } from './data/useAsync';
import { countItems, percentFor } from './learn/model';
import { Loaded } from './learn/ui';

const NO_PROGRESS = { completedItemIds: [], pariksha: {}, lastItemId: null };

const STATE_LABEL: Record<ItemState, string> = {
  done: 'Done',
  current: 'Up next',
  todo: '',
  locked: 'Locked',
};

/** A course's overview: description, outcomes, the outline with per-item state, and Resume. */
export function CoursePage() {
  const { courseId = '' } = useParams();
  const data = useLearnerData();
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const [progress, setProgress] = useState<ProgressRow | null>(null);
  const result = useAsync(useCallback(() => data.getCourse(courseId), [data, courseId]));
  useEffect(() => data.watchProgress(uid, courseId, setProgress), [data, uid, courseId]);

  return (
    <Loaded loadable={result}>
      {(course) =>
        course ? (
          <Overview course={course} progress={progress} />
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

function Overview({ course, progress }: { course: Course; progress: ProgressRow | null }) {
  const state = progress ?? NO_PROGRESS;
  const states = itemStates(course, state);
  const resume = resumeItemId(course, state);
  const resumeTitle = itemsOf(course).find((i) => i.id === resume)?.title;
  const counts = countItems(course);
  const percent = percentFor(course, progress);
  const currentParva = course.parvas.find((p) => p.items.some((i) => states[i.id] === 'current'));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === currentParva?.id;

  return (
    <main className="page">
      <Breadcrumb
        items={[
          { label: 'Catalogue', render: (p) => <Link to="/courses" {...(p as object)} /> },
          { label: course.title },
        ]}
      />
      <h1 className="page__title">{course.title}</h1>
      <p className="course__summary">{course.summary}</p>
      <p className="course__meta">
        {course.parvas.length} parvas · {counts.lessons} lessons · {counts.parikshas} Parikshas ·{' '}
        {course.estimatedMinutes} min
        {course.rules.certificate ? ' · Certificate' : ''}
        {course.status === 'archived' ? ' · Retired' : ''}
      </p>
      {resume ? (
        <Link className={buttonClass('primary')} to={`/courses/${course.id}/learn/${resume}`}>
          {progress ? `Resume — ${resumeTitle}` : 'Start course'}
        </Link>
      ) : null}

      <div className="course__layout">
        <section aria-labelledby="outline-title">
          <h2 id="outline-title">Outline</h2>
          {course.parvas.map((parva, n) => {
            const expanded = isOpen(parva.id);
            const done = parva.items.filter((i) => states[i.id] === 'done').length;
            return (
              <Card as="section" key={parva.id} className="parva">
                <h3 className="parva__title">
                  <button
                    type="button"
                    className="parva__toggle"
                    aria-expanded={expanded}
                    aria-controls={`parva-${parva.id}`}
                    onClick={() => setOpen({ ...open, [parva.id]: !expanded })}
                  >
                    <span className="parva__label">Parva {n + 1}</span> {parva.title}
                    <span className="parva__count">
                      {done}/{parva.items.length}
                    </span>
                  </button>
                </h3>
                {expanded ? (
                  <ul id={`parva-${parva.id}`} className="items">
                    {parva.items.map((item) => {
                      const s = states[item.id] as ItemState;
                      const label = (
                        <>
                          <span>{item.title}</span>
                          <span className="items__kind">
                            {item.type === 'lesson' ? `${item.minutes} min` : 'Pariksha'}
                          </span>
                          {STATE_LABEL[s] ? (
                            <Chip tone={s === 'done' ? 'accent' : 'neutral'}>{STATE_LABEL[s]}</Chip>
                          ) : null}
                        </>
                      );
                      return (
                        <li key={item.id}>
                          {s === 'locked' || item.type === 'pariksha' ? (
                            <span className="items__row" aria-disabled="true">
                              {label}
                            </span>
                          ) : (
                            <Link
                              className="items__row"
                              to={`/courses/${course.id}/learn/${item.id}`}
                            >
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
              <dt>Parikshas</dt>
              <dd>{counts.parikshas}</dd>
            </dl>
            <p>Pass mark {Math.round(course.rules.passMark * 100)}% on each Pariksha.</p>
          </Card>
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
    </main>
  );
}

import { itemsOf } from '@gurukul/schema';
import type { Course, Question } from '@gurukul/schema';
import {
  Breadcrumb,
  Chip,
  EmptyState,
  FunnelBar,
  StatCard,
  buttonClass,
  largestDrop,
} from '@gurukul/ui';
import { useCallback } from 'react';
import { Link, useParams } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { averageDays, funnelSteps, hardestQuestions, pct } from './model';

const prompt = (course: Course, questionId: string): string => {
  const all: Question[] = itemsOf(course).flatMap((i) =>
    i.type === 'pariksha' ? i.questions : [],
  );
  return all.find((q) => q.id === questionId)?.prompt ?? questionId;
};

/** `/kulapati/courses/:courseId`: the funnel, where learners stop and the hardest questions. */
export function CourseAnalyticsPage() {
  const { courseId = '' } = useParams();
  const { data } = useConsole();
  const learner = useLearnerData();
  const result = useAsync(
    useCallback(async () => {
      const [course, stats] = await Promise.all([
        learner.getCourse(courseId),
        data.courseStats(courseId),
      ]);
      return { course, stats };
    }, [data, learner, courseId]),
  );

  return (
    <main className="page console">
      <Loaded loadable={result}>
        {({ course, stats }) => {
          if (!course) {
            return (
              <EmptyState
                title="This course does not exist"
                action={
                  <Link className={buttonClass('secondary')} to="/kulapati">
                    Back to the overview
                  </Link>
                }
              >
                It may have been removed.
              </EmptyState>
            );
          }
          const steps = funnelSteps(
            stats,
            course.parvas.map((p) => p.title),
          );
          const drop = largestDrop(steps.map((s) => s.value));
          const days = averageDays(stats);
          const hardest = hardestQuestions(stats);
          const parikshas = itemsOf(course).flatMap((i) => (i.type === 'pariksha' ? [i] : []));
          return (
            <>
              <Breadcrumb
                items={[
                  { label: 'Overview', render: (p) => <Link to="/kulapati" {...(p as object)} /> },
                  { label: course.title },
                ]}
              />
              <h1 className="page__title">{course.title}</h1>
              <p>
                <Chip tone="accent">
                  {course.status === 'published' ? `Published · v${course.version}` : course.status}
                </Chip>
              </p>
              <div className="cert-actions">
                <Link
                  className={buttonClass('primary')}
                  to="/kulapati/assign"
                  state={{ courseId: course.id }}
                >
                  Assign this course
                </Link>
              </div>
              <div className="stats">
                <StatCard label="Assigned" value={String(stats.assigned)} />
                <StatCard
                  label="Started"
                  value={String(stats.started)}
                  sub={
                    pct(stats.started, stats.assigned) === null
                      ? '—'
                      : `${pct(stats.started, stats.assigned)}% of assigned`
                  }
                />
                <StatCard label="Certified" value={String(stats.certified)} />
                <StatCard
                  label="Average time to finish"
                  value={days === null ? '—' : `${days} days`}
                />
              </div>

              <section aria-labelledby="stop-title" className="home-section">
                <h2 id="stop-title">Where learners stop</h2>
                <FunnelBar label="Learner funnel" rows={steps} highlight={drop} />
                {drop !== null && steps[drop] && steps[drop - 1] ? (
                  <p>
                    The biggest drop is between “{steps[drop - 1]?.label}” ({steps[drop - 1]?.value}
                    ) and “{steps[drop]?.label}” ({steps[drop]?.value}).
                  </p>
                ) : null}
              </section>

              <section aria-labelledby="hard-title" className="home-section">
                <h2 id="hard-title">Hardest questions</h2>
                {hardest.length === 0 ? (
                  <EmptyState title="Not enough attempts yet">
                    Questions appear here once three people have answered them.
                  </EmptyState>
                ) : (
                  <ol className="hardest">
                    {hardest.map((q) => (
                      <li key={q.questionId}>
                        <span className={q.percent < 50 ? 'hardest__low' : 'hardest__mid'}>
                          {q.percent}% right first time
                        </span>{' '}
                        {prompt(course, q.questionId)}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section aria-labelledby="pariksha-title" className="home-section">
                <h2 id="pariksha-title">Parikshas</h2>
                <table className="plain-table">
                  <caption className="sr-only">Parikshas in this course</caption>
                  <thead>
                    <tr>
                      <th scope="col">Pariksha</th>
                      <th scope="col">Questions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parikshas.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">{p.title}</th>
                        <td>{p.questions.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          );
        }}
      </Loaded>
    </main>
  );
}

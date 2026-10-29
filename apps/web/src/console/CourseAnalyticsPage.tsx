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
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import {
  WARN_BELOW_PERCENT,
  averageDays,
  medianDays,
  funnelSteps,
  hardestQuestions,
  quizRows,
  pct,
} from './model';

const prompt = (course: Course, questionId: string): string => {
  const all: Question[] = itemsOf(course).flatMap((i) => (i.type === 'quiz' ? i.questions : []));
  return all.find((q) => q.id === questionId)?.prompt ?? questionId;
};

const studioQuiz = (courseId: string, quizId: string): string =>
  `/studio/courses/${courseId}/quiz/${quizId}`;

/** `/admin/courses/:courseId`: the funnel, where learners stop and the hardest questions. */
export function CourseAnalyticsPage() {
  const t = useTerms();
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
                  <Link className={buttonClass('secondary')} to="/admin">
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
            course.chapters.map((p) => p.title),
          );
          const drop = largestDrop(steps.map((s) => s.value));
          const days = averageDays(stats);
          const median = medianDays(stats);
          const hardest = hardestQuestions(stats);
          const quizzes = itemsOf(course).flatMap((i) => (i.type === 'quiz' ? [i] : []));
          const rows = quizRows(quizzes, stats);
          const quizOf = new Map(
            quizzes.flatMap((p) => p.questions.map((q) => [q.id, p.id] as const)),
          );
          return (
            <>
              <Breadcrumb
                items={[
                  { label: 'Overview', render: (p) => <Link to="/admin" {...(p as object)} /> },
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
                <Link className={buttonClass('secondary')} to={`/studio/courses/${course.id}`}>
                  {`Edit in ${t.Studio}`}
                </Link>
                <Link
                  className={buttonClass('primary')}
                  to="/admin/assign"
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
                  label="Median time to finish"
                  value={median === null ? '—' : `${median} days`}
                  sub={days === null ? undefined : `average ${days} days`}
                />
              </div>

              <section aria-labelledby="stop-title" className="home-section">
                <h2 id="stop-title">{`Where ${t.learners} stop`}</h2>
                <FunnelBar label={`${t.Learner} funnel`} rows={steps} highlight={drop} />
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
                        <span
                          className={
                            q.percent < 50
                              ? 'hardest__low'
                              : q.percent < WARN_BELOW_PERCENT
                                ? 'hardest__mid'
                                : undefined
                          }
                        >
                          {q.percent}% right first time
                        </span>{' '}
                        {prompt(course, q.questionId)}{' '}
                        {quizOf.has(q.questionId) ? (
                          <Link
                            to={`${studioQuiz(course.id, quizOf.get(q.questionId) as string)}?question=${encodeURIComponent(q.questionId)}`}
                          >
                            Edit question
                          </Link>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section aria-labelledby="quiz-title" className="home-section">
                <h2 id="quiz-title">{t.Quizzes}</h2>
                <table className="plain-table">
                  <caption className="sr-only">{`${t.Quizzes} in this course`}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t.Quiz}</th>
                      <th scope="col">Questions</th>
                      <th scope="col">First-try answers</th>
                      <th scope="col">Right first time</th>
                      <th scope="col">
                        <span className="sr-only">Edit</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <th scope="row">{r.title}</th>
                        <td>{r.questions}</td>
                        <td>{r.answers}</td>
                        <td
                          className={
                            r.percent !== null && r.percent < WARN_BELOW_PERCENT
                              ? 'hardest__mid'
                              : undefined
                          }
                        >
                          {r.percent === null ? '—' : `${r.percent}%`}
                        </td>
                        <td>
                          <Link to={studioQuiz(course.id, r.id)}>{`Edit this ${t.Quiz}`}</Link>
                        </td>
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

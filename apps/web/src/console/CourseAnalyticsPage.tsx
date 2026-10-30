import { itemsOf } from '@gurukul/schema';
import type { Course, Question } from '@gurukul/schema';
import {
  Breadcrumb,
  Card,
  Chip,
  DataTable,
  EmptyState,
  FunnelBar,
  Page,
  PageHeader,
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
    <Page width="wide">
      <Loaded loadable={result}>
        {({ course, stats }) => {
          if (!course) {
            return (
              <>
                <PageHeader eyebrow={t.Admin} title="Course analytics" />
                <EmptyState
                  title="This course does not exist"
                  headingAs="h2"
                  action={
                    <Link className={buttonClass('secondary')} to="/admin">
                      Back to the overview
                    </Link>
                  }
                >
                  It may have been removed.
                </EmptyState>
              </>
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
          const started = pct(stats.started, stats.assigned);
          return (
            <>
              <PageHeader
                breadcrumb={
                  <Breadcrumb
                    items={[
                      {
                        label: 'Overview',
                        render: (p) => <Link to="/admin" {...(p as object)} />,
                      },
                      { label: course.title },
                    ]}
                  />
                }
                eyebrow={`${t.Admin} · ${t.Analytics}`}
                title={course.title}
                meta={
                  <Chip tone={course.status === 'published' ? 'accent' : 'neutral'}>
                    {course.status === 'published'
                      ? `Published · v${course.version}`
                      : course.status === 'draft'
                        ? 'Draft'
                        : 'Archived'}
                  </Chip>
                }
                actions={
                  <>
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
                  </>
                }
              />
              <div className="console-stats">
                <StatCard label="Assigned" value={String(stats.assigned)} />
                <StatCard
                  label="Started"
                  value={String(stats.started)}
                  sub={started === null ? '—' : `${started}% of assigned`}
                />
                <StatCard label="Certified" value={String(stats.certified)} />
                <StatCard
                  label="Median time to finish"
                  value={median === null ? '—' : `${median} days`}
                  sub={days === null ? undefined : `average ${days} days`}
                />
              </div>

              <Card title={`Where ${t.learners} stop`}>
                <div className="console-stack">
                  <FunnelBar label={`${t.Learner} funnel`} rows={steps} highlight={drop} />
                  {drop !== null && steps[drop] && steps[drop - 1] ? (
                    <p className="console-muted">
                      The biggest drop is between “{steps[drop - 1]?.label}” (
                      {steps[drop - 1]?.value}) and “{steps[drop]?.label}” ({steps[drop]?.value}).
                    </p>
                  ) : null}
                </div>
              </Card>

              <Card title="Hardest questions">
                {hardest.length === 0 ? (
                  <EmptyState title="Not enough attempts yet">
                    Questions appear here once three people have answered them.
                  </EmptyState>
                ) : (
                  <ol className="console-rows">
                    {hardest.map((q) => (
                      <li key={q.questionId} className="console-row">
                        <Chip
                          tone={
                            q.percent < 50
                              ? 'danger'
                              : q.percent < WARN_BELOW_PERCENT
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {q.percent}% right first time
                        </Chip>
                        <span className="console-row__text">{prompt(course, q.questionId)}</span>
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
              </Card>

              <Card title={t.Quizzes}>
                <DataTable
                  caption={`${t.Quizzes} in this course`}
                  rows={rows}
                  rowKey={(r) => r.id}
                  columns={[
                    { id: 'title', header: t.Quiz, rowHeader: true, cell: (r) => r.title },
                    {
                      id: 'questions',
                      header: 'Questions',
                      align: 'end',
                      cell: (r) => r.questions,
                    },
                    {
                      id: 'answers',
                      header: 'First-try answers',
                      align: 'end',
                      cell: (r) => r.answers,
                    },
                    {
                      id: 'right',
                      header: 'Right first time',
                      align: 'end',
                      cell: (r) =>
                        r.percent === null ? (
                          '—'
                        ) : r.percent < WARN_BELOW_PERCENT ? (
                          <Chip tone="warning">{`${r.percent}%`}</Chip>
                        ) : (
                          `${r.percent}%`
                        ),
                    },
                    {
                      id: 'edit',
                      header: <span className="sr-only">Edit</span>,
                      cell: (r) => (
                        <Link to={studioQuiz(course.id, r.id)}>{`Edit this ${t.Quiz}`}</Link>
                      ),
                    },
                  ]}
                />
              </Card>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}

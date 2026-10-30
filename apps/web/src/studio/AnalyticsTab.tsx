import { Callout, Card, DataTable, EmptyState, Skeleton, StatCard, buttonClass } from '@gurukul/ui';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useConsole } from '../console/ConsoleProvider';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';

/** How many people were assigned, started, finished and certified; the funnel lives in the console. */
export function AnalyticsTab({
  courseId,
  published,
  admin,
}: {
  courseId: string;
  published: boolean;
  admin: boolean;
}) {
  const { data } = useConsole();
  const t = useTerms();
  const result = useAsync(
    useCallback(
      () =>
        data.courseStats(courseId).catch((e: unknown) => {
          log.warn('Loading course stats failed', { courseId });
          throw e;
        }),
      [data, courseId],
    ),
  );
  const learners = useAsync(
    useCallback(
      () =>
        data.courseLearners(courseId).catch((e: unknown) => {
          log.warn('Loading course learners failed', { courseId });
          throw e;
        }),
      [data, courseId],
    ),
  );
  return (
    <section className="sc-tab" aria-labelledby="analytics-title">
      <h2 id="analytics-title" className="sc-h2">
        Analytics
      </h2>
      {published ? null : (
        <Callout tone="note" title="Not published yet">
          <p>{`Numbers appear once ${t.learners} are assigned the published course.`}</p>
        </Callout>
      )}
      {result.state === 'loading' ? (
        <Loading label="Loading the numbers…" />
      ) : result.state === 'error' ? (
        <Callout tone="warning" title="The numbers are not available" role="alert">
          <p>You may not have access to them, or the connection dropped. Try again later.</p>
        </Callout>
      ) : (
        <div className="sc-stats">
          <StatCard label="Assigned" value={String(result.value.assigned)} />
          <StatCard label="Started" value={String(result.value.started)} />
          <StatCard label="Completed" value={String(result.value.completed)} />
          <StatCard label="Certified" value={String(result.value.certified)} />
        </div>
      )}
      <Card title={t.Learners} titleAs="h3">
        {learners.state === 'loading' ? (
          <Loading label={`Loading the ${t.learners}…`} />
        ) : learners.state === 'error' ? (
          <Callout tone="warning" title={`The ${t.learners} are not available`} role="alert">
            <p>You may not have access to them, or the connection dropped. Try again later.</p>
          </Callout>
        ) : learners.value.length === 0 ? (
          <EmptyState title="No one has started this course yet" headingAs="h4">
            {`${t.Learners} appear here once they open the course.`}
          </EmptyState>
        ) : (
          <DataTable
            caption="People who started this course"
            rows={learners.value}
            rowKey={(l) => l.uid}
            columns={[
              {
                id: 'name',
                header: t.Learner,
                rowHeader: true,
                cell: (l) => (l.displayName === '' ? 'Name not recorded' : l.displayName),
              },
              { id: 'progress', header: 'Progress', align: 'end', cell: (l) => `${l.percent}%` },
              {
                id: 'active',
                header: 'Last active',
                cell: (l) =>
                  l.lastActiveAt === null ? '—' : l.lastActiveAt.toISOString().slice(0, 10),
              },
            ]}
          />
        )}
      </Card>
      {admin ? (
        <p>
          <Link className={buttonClass('secondary')} to={`/admin/courses/${courseId}`}>
            Open the full funnel
          </Link>
        </p>
      ) : null}
    </section>
  );
}

/** A region still loading: skeletons in its shape, the words for screen readers. */
function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <Skeleton shape="block" height={72} />
    </div>
  );
}

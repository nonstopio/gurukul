import { Callout, StatCard, buttonClass } from '@gurukul/ui';
import { useCallback } from 'react';
import { Link } from 'react-router';
import { useConsole } from '../console/ConsoleProvider';
import { useAsync } from '../data/useAsync';
import { log } from '../log';

/** How many people were assigned, started, finished and certified; the funnel lives in the console. */
export function AnalyticsTab({
  courseId,
  published,
  kulapati,
}: {
  courseId: string;
  published: boolean;
  kulapati: boolean;
}) {
  const { data } = useConsole();
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
  return (
    <section className="sc-tab" aria-labelledby="analytics-title">
      <h2 id="analytics-title" className="sc-h2">
        Analytics
      </h2>
      {published ? null : (
        <Callout tone="note" title="Not published yet">
          <p>Numbers appear once learners are assigned the published course.</p>
        </Callout>
      )}
      {result.state === 'loading' ? (
        <p role="status">Loading the numbers…</p>
      ) : result.state === 'error' ? (
        <Callout tone="warning" title="The numbers are not available" role="alert">
          <p>You may not have access to them, or the connection dropped. Try again later.</p>
        </Callout>
      ) : (
        <div className="stats">
          <StatCard label="Assigned" value={String(result.value.assigned)} />
          <StatCard label="Started" value={String(result.value.started)} />
          <StatCard label="Completed" value={String(result.value.completed)} />
          <StatCard label="Certified" value={String(result.value.certified)} />
        </div>
      )}
      {kulapati ? (
        <p>
          <Link className={buttonClass('secondary')} to={`/kulapati/courses/${courseId}`}>
            Open the full funnel
          </Link>
        </p>
      ) : null}
    </section>
  );
}

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
      <h3 className="sc-h3">Learners</h3>
      {learners.state === 'loading' ? (
        <p role="status">Loading the learners…</p>
      ) : learners.state === 'error' ? (
        <Callout tone="warning" title="The learners are not available" role="alert">
          <p>You may not have access to them, or the connection dropped. Try again later.</p>
        </Callout>
      ) : learners.value.length === 0 ? (
        <p>No one has started this course yet.</p>
      ) : (
        <table className="plain-table">
          <caption className="sr-only">People who started this course</caption>
          <thead>
            <tr>
              <th scope="col">Learner</th>
              <th scope="col">Progress</th>
              <th scope="col">Last active</th>
            </tr>
          </thead>
          <tbody>
            {learners.value.map((l) => (
              <tr key={l.uid}>
                <th scope="row">{l.displayName === '' ? 'Name not recorded' : l.displayName}</th>
                <td>{l.percent}%</td>
                <td>{l.lastActiveAt === null ? '—' : l.lastActiveAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

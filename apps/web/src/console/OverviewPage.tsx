import { itemsOf } from '@gurukul/schema';
import { BarChart, Button, EmptyState, StatCard, buttonClass } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { assignmentsCsv, isOverdue, pct, weeklySeries } from './model';

/** Hands the browser a file to save; nothing leaves the page. */
function downloadCsv(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Sanjaya: the numbers a Kulapati checks first. Every figure comes from a counter document. */
export function OverviewPage() {
  const { data } = useConsole();
  const learner = useLearnerData();
  const [now] = useState(() => new Date());
  const load = useCallback(async () => {
    const [org, courses, assignments] = await Promise.all([
      data.orgStats(),
      learner.listCourses(),
      data.assignments(),
    ]);
    const rows = await Promise.all(
      courses.map(async (course) => ({ course, stats: await data.courseStats(course.id) })),
    );
    return { org, assignments, rows };
  }, [data, learner]);
  const result = useAsync(load);

  return (
    <main className="page console">
      <p className="article__kicker">Kulapati · Sanjaya</p>
      <h1 className="page__title">Overview</h1>
      <div className="cert-actions">
        <Link className={buttonClass('primary')} to="/kulapati/assign">
          Assign courses
        </Link>
        <Link className={buttonClass('secondary')} to="/kulapati/learners">
          Learners
        </Link>
        <Link className={buttonClass('secondary')} to="/kulapati/roles">
          Roles & access
        </Link>
        <Link className={buttonClass('secondary')} to="/kulapati/audit">
          Audit log
        </Link>
      </div>
      <Loaded loadable={result}>
        {({ org, assignments, rows }) => {
          const overdue = assignments.filter((a) => isOverdue(a, now)).length;
          const pending = new Set(assignments.filter((a) => a.uid === null).map((a) => a.email))
            .size;
          const series = weeklySeries(org, now);
          const quiet = series.every((s) => s.value === 0);
          const titles = new Map(rows.map(({ course }) => [course.id, course.title]));
          const done = pct(org.assignmentsCompleted, org.assignmentsTotal);
          return (
            <>
              <div className="stats">
                <StatCard
                  label="Active learners (30 days)"
                  value={org.usersTotal > 0 ? String(org.activeLearners30d) : '—'}
                  sub={org.usersTotal > 0 ? `of ${org.usersTotal} signed in` : 'No learners yet'}
                />
                <StatCard
                  label="Assignments completed"
                  value={done === null ? '—' : `${done}%`}
                  sub={`${org.assignmentsCompleted} of ${org.assignmentsTotal}`}
                />
                <StatCard
                  label="Overdue assignments"
                  value={String(overdue)}
                  sub="Past their due date"
                />
                <StatCard
                  label="Pending invites"
                  value={String(pending)}
                  sub="Assigned, not signed in yet"
                />
              </div>

              <section aria-labelledby="weekly-title" className="home-section">
                <h2 id="weekly-title">Lessons completed per week</h2>
                {quiet ? (
                  <EmptyState title="No activity yet">
                    Completed lessons will appear here week by week.
                  </EmptyState>
                ) : (
                  <BarChart
                    title="Lessons completed per week"
                    data={series}
                    unit="lessons"
                    labelHeader="Week"
                  />
                )}
              </section>

              <section aria-labelledby="funnel-title" className="home-section">
                <h2 id="funnel-title">Courses</h2>
                <Button
                  variant="secondary"
                  disabled={assignments.length === 0}
                  onClick={() =>
                    downloadCsv('assignments.csv', assignmentsCsv(assignments, titles))
                  }
                >
                  Export CSV
                </Button>
                {rows.length === 0 ? (
                  <EmptyState title="No courses yet">
                    Published courses appear here with their funnel.
                  </EmptyState>
                ) : (
                  <table className="plain-table">
                    <caption className="sr-only">Course funnel</caption>
                    <thead>
                      <tr>
                        <th scope="col">Course</th>
                        <th scope="col">Assigned</th>
                        <th scope="col">Started</th>
                        <th scope="col">Completed</th>
                        <th scope="col">Average score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ course, stats }) => {
                        const avg =
                          stats.scoreCount > 0
                            ? Math.round((stats.scoreSum / stats.scoreCount) * 100)
                            : null;
                        const completion = pct(stats.completed, stats.assigned);
                        return (
                          <tr key={course.id}>
                            <th scope="row">
                              <Link to={`/kulapati/courses/${course.id}`}>{course.title}</Link>
                              <span className="items__kind">{itemsOf(course).length} items</span>
                            </th>
                            <td>{stats.assigned}</td>
                            <td>{stats.started}</td>
                            <td>
                              {stats.completed}
                              {completion === null ? '' : ` (${completion}%)`}
                            </td>
                            <td>{avg === null ? '—' : `${avg}%`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          );
        }}
      </Loaded>
    </main>
  );
}

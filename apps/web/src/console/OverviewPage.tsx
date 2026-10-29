import { itemsOf } from '@gurukul/schema';
import { BarChart, Button, EmptyState, Select, StatCard, buttonClass } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { useTerms } from '../labels/useTerms';
import { Loaded } from '../learn/ui';
import { useConsole } from './ConsoleProvider';
import { NeedsAttention } from './NeedsAttention';
import type { AttentionInput } from './NeedsAttention';
import { DATE_RANGES, assignmentsCsv, failedTwice, pct, rangeStart, weeklySeries } from './model';
import type { DateRange } from './model';

/** Hands the browser a file to save; nothing leaves the page. */
function downloadCsv(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Analytics: the numbers an Admin checks first. Every figure comes from a counter document. */
export function OverviewPage() {
  const { data } = useConsole();
  const t = useTerms();
  const learner = useLearnerData();
  const [now] = useState(() => new Date());
  const [range, setRange] = useState<DateRange>('all');
  const [team, setTeam] = useState('');
  const load = useCallback(async () => {
    const [org, courses, assignments, open, overdue, recent, teams] = await Promise.all([
      data.orgStats(),
      learner.listCourses(),
      data.assignments(),
      data.openAssignments(now),
      data.overdueCount(now),
      data.recentProgress(),
      data.teams(),
    ]);
    const rows = await Promise.all(
      courses.map(async (course) => ({ course, stats: await data.courseStats(course.id) })),
    );
    const failed = failedTwice(recent);
    const people = new Map(
      (await data.usersByUid([...new Set(failed.map((f) => f.uid))].slice(0, 30))).map((u) => [
        u.uid,
        u,
      ]),
    );
    const attention: AttentionInput = {
      open,
      failed,
      people,
      courseTitles: new Map(courses.map((c) => [c.id, c.title])),
      quizTitles: new Map(
        courses.flatMap((c) =>
          itemsOf(c)
            .filter((i) => i.type === 'quiz')
            .map((i) => [`${c.id}/${i.id}`, (i as { title: string }).title] as const),
        ),
      ),
      now,
    };
    return { org, assignments, open, overdue, rows, attention, teams };
  }, [data, learner, now]);
  const result = useAsync(load);

  return (
    <main className="page console">
      <p className="article__kicker">{`${t.Admin} · ${t.Analytics}`}</p>
      <h1 className="page__title">Overview</h1>
      <div className="cert-actions">
        <Link className={buttonClass('primary')} to="/admin/assign">
          Assign courses
        </Link>
        <Link className={buttonClass('secondary')} to="/admin/learners">
          {t.Learners}
        </Link>
        <Link className={buttonClass('secondary')} to="/admin/roles">
          Roles & access
        </Link>
        <Link className={buttonClass('secondary')} to="/admin/audit">
          Audit log
        </Link>
      </div>
      <Loaded loadable={result}>
        {({ org, assignments, open, overdue, rows, attention, teams }) => {
          const pending = new Set(open.filter((a) => a.uid === null).map((a) => a.email)).size;
          const series = weeklySeries(org, now);
          const quiet = series.every((s) => s.value === 0);
          const titles = new Map(rows.map(({ course }) => [course.id, course.title]));
          const done = pct(org.assignmentsCompleted, org.assignmentsTotal);
          const avgScore = pct(org.quizScoreSum, org.quizScoreCount);
          const firstTry = pct(org.quizFirstTryPassed, org.quizFirstTryTotal);
          return (
            <>
              <div className="stats">
                <StatCard
                  label={`Active ${t.learners} (30 days)`}
                  value={org.usersTotal > 0 ? String(org.activeLearners30d) : '—'}
                  sub={
                    org.usersTotal > 0 ? `of ${org.usersTotal} signed in` : `No ${t.learners} yet`
                  }
                />
                <StatCard
                  label="Assignments completed"
                  value={done === null ? '—' : `${done}%`}
                  sub={`${org.assignmentsCompleted} of ${org.assignmentsTotal}`}
                />
                <StatCard
                  label={`Average ${t.Quiz} score`}
                  value={avgScore === null ? '—' : `${avgScore}%`}
                  sub={
                    org.quizScoreCount > 0
                      ? `Over ${org.quizScoreCount} graded attempts`
                      : 'No attempts yet'
                  }
                />
                <StatCard
                  label="First-try pass rate"
                  value={firstTry === null ? '—' : `${firstTry}%`}
                  sub={`${org.quizFirstTryPassed} of ${org.quizFirstTryTotal} first attempts`}
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

              <div className="filters">
                <Select
                  label="Date range"
                  value={range}
                  onChange={(e) => setRange(e.target.value as DateRange)}
                >
                  {DATE_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <Select label="Team" value={team} onChange={(e) => setTeam(e.target.value)}>
                  <option value="">All teams</option>
                  {teams.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
                <p className="attention__more">
                  Narrows Needs attention below; the figures above are for the whole organisation.
                </p>
              </div>

              <NeedsAttention input={attention} start={rangeStart(range, now)} team={team} />

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
                              <Link to={`/admin/courses/${course.id}`}>{course.title}</Link>
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

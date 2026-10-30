import { itemsOf } from '@gurukul/schema';
import {
  BarChart,
  Button,
  buttonClass,
  Card,
  DataTable,
  DownloadIcon,
  EmptyState,
  FilterBar,
  Page,
  PageHeader,
  Select,
  StatCard,
} from '@gurukul/ui';
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

  const ready = result.state === 'ready' ? result.value : null;

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={`${t.Admin} · ${t.Analytics}`}
        title="Overview"
        lead="Figures are for the whole organisation; the filters narrow Needs attention."
        actions={
          <>
            <Link className={buttonClass('ghost')} to="/admin/audit">
              Audit log
            </Link>
            <Button
              variant="secondary"
              icon={<DownloadIcon />}
              disabled={!ready || ready.assignments.length === 0}
              onClick={() =>
                ready &&
                downloadCsv(
                  'assignments.csv',
                  assignmentsCsv(
                    ready.assignments,
                    new Map(ready.rows.map(({ course }) => [course.id, course.title])),
                  ),
                )
              }
            >
              Export CSV
            </Button>
            <Link className={buttonClass('primary')} to="/admin/assign">
              Assign courses
            </Link>
          </>
        }
      />
      <Loaded loadable={result}>
        {({ org, open, overdue, rows, attention, teams }) => {
          const pending = new Set(open.filter((a) => a.uid === null).map((a) => a.email)).size;
          const series = weeklySeries(org, now);
          const quiet = series.every((s) => s.value === 0);
          const done = pct(org.assignmentsCompleted, org.assignmentsTotal);
          const avgScore = pct(org.quizScoreSum, org.quizScoreCount);
          const firstTry = pct(org.quizFirstTryPassed, org.quizFirstTryTotal);
          return (
            <>
              <div className="console-stats">
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

              <Card title="Lessons completed per week">
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
              </Card>

              <NeedsAttention
                input={attention}
                start={rangeStart(range, now)}
                team={team}
                filters={
                  <FilterBar label="Filter Needs attention">
                    <Select
                      label="Date range"
                      hideLabel
                      value={range}
                      onChange={(e) => setRange(e.target.value as DateRange)}
                    >
                      {DATE_RANGES.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Team"
                      hideLabel
                      value={team}
                      onChange={(e) => setTeam(e.target.value)}
                    >
                      <option value="">Any team</option>
                      {teams.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </FilterBar>
                }
              />

              <Card title="Courses">
                {rows.length === 0 ? (
                  <EmptyState title="No courses yet">
                    Published courses appear here with their funnel.
                  </EmptyState>
                ) : (
                  <DataTable
                    caption="Course funnel"
                    rows={rows}
                    rowKey={(r) => r.course.id}
                    columns={[
                      {
                        id: 'course',
                        header: 'Course',
                        rowHeader: true,
                        cell: ({ course }) => (
                          <span className="console-row__text">
                            <Link to={`/admin/courses/${course.id}`}>{course.title}</Link>
                            <span className="console-muted">{itemsOf(course).length} items</span>
                          </span>
                        ),
                      },
                      {
                        id: 'assigned',
                        header: 'Assigned',
                        align: 'end',
                        cell: (r) => r.stats.assigned,
                      },
                      {
                        id: 'started',
                        header: 'Started',
                        align: 'end',
                        cell: (r) => r.stats.started,
                      },
                      {
                        id: 'completed',
                        header: 'Completed',
                        align: 'end',
                        cell: ({ stats }) => {
                          const completion = pct(stats.completed, stats.assigned);
                          return `${stats.completed}${completion === null ? '' : ` (${completion}%)`}`;
                        },
                      },
                      {
                        id: 'score',
                        header: 'Average score',
                        align: 'end',
                        cell: ({ stats }) =>
                          stats.scoreCount > 0
                            ? `${Math.round((stats.scoreSum / stats.scoreCount) * 100)}%`
                            : '—',
                      },
                    ]}
                  />
                )}
              </Card>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}

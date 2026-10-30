import {
  Button,
  Card,
  Chip,
  EmptyState,
  FilterBar,
  Page,
  PageHeader,
  Select,
  Toggle,
} from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import { LEVEL_LABELS, countItems, isRetired } from './learn/model';
import { CoverTile, Loaded } from './learn/ui';
import { useTerms } from './labels/useTerms';

/** Every published course, filterable by level and "assigned to me". Self-enrolment: all are open. */
export function CoursesPage() {
  const data = useLearnerData();
  const uid = useUser().uid;
  const t = useTerms();
  const [level, setLevel] = useState('');
  const [mine, setMine] = useState(false);
  const load = useCallback(async () => {
    const [courses, assignments] = await Promise.all([data.listCourses(), data.myAssignments(uid)]);
    return { courses, assignedIds: new Set(assignments.map((a) => a.courseId)) };
  }, [data, uid]);
  const result = useAsync(load);
  const clear = () => {
    setLevel('');
    setMine(false);
  };
  const shown =
    result.state === 'ready'
      ? result.value.courses.filter(
          (c) => (!level || c.level === level) && (!mine || result.value.assignedIds.has(c.id)),
        )
      : [];

  return (
    <Page>
      <PageHeader
        title="Course catalogue"
        lead="Every published course is open to you. Pick one and start."
      />
      <FilterBar
        label="Filter courses"
        count={
          result.state === 'ready' ? `${shown.length} of ${result.value.courses.length}` : undefined
        }
        canClear={level !== '' || mine}
        onClear={clear}
      >
        <Select label="Level" hideLabel value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Any level</option>
          {Object.entries(LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Toggle label="Assigned to me" checked={mine} onChange={(e) => setMine(e.target.checked)} />
      </FilterBar>
      <Loaded loadable={result}>
        {({ courses, assignedIds }) =>
          courses.length === 0 ? (
            <EmptyState title="No courses published yet" headingAs="h2">
              Courses appear here as soon as an {t.Educator} publishes one.
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState
              title="No courses match"
              headingAs="h2"
              action={
                <Button variant="secondary" onClick={clear}>
                  Show all courses
                </Button>
              }
            >
              Try another level, or turn off “Assigned to me”.
            </EmptyState>
          ) : (
            <ul className="learn-cards">
              {shown.map((c) => {
                const n = countItems(c);
                return (
                  <Card as="li" key={c.id} className="course-card">
                    <CoverTile cover={c.cover} size="large" />
                    <span className="learn-chips">
                      <Chip tone="neutral">{LEVEL_LABELS[c.level]}</Chip>
                      {isRetired(c) ? <Chip tone="warning">Retired</Chip> : null}
                      {assignedIds.has(c.id) ? <Chip tone="accent">Assigned</Chip> : null}
                    </span>
                    <h2 className="learn-display">
                      <Link to={`/courses/${c.id}`}>{c.title}</Link>
                    </h2>
                    <p className="learn-muted">{c.summary}</p>
                    <p className="learn-meta">
                      {n.lessons} lessons · {n.quizzes} {t.Quizzes} · {c.estimatedMinutes} min
                    </p>
                  </Card>
                );
              })}
            </ul>
          )
        }
      </Loaded>
    </Page>
  );
}

import { Card, Chip, EmptyState, Select, Toggle } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import { countItems } from './learn/model';
import { Loaded } from './learn/ui';

const LEVELS = { foundation: 'Foundation', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Every published course, filterable by level and "assigned to me". Self-enrolment: all are open. */
export function CoursesPage() {
  const data = useLearnerData();
  const { user } = useSession();
  const uid = user?.uid ?? '';
  const [level, setLevel] = useState('');
  const [mine, setMine] = useState(false);
  const load = useCallback(async () => {
    const [courses, assignments] = await Promise.all([data.listCourses(), data.myAssignments(uid)]);
    return { courses, assignedIds: new Set(assignments.map((a) => a.courseId)) };
  }, [data, uid]);
  const result = useAsync(load);

  return (
    <main className="page">
      <h1 className="page__title">Course catalogue</h1>
      <div className="filters">
        <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">All levels</option>
          {Object.entries(LEVELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Toggle label="Assigned to me" checked={mine} onChange={(e) => setMine(e.target.checked)} />
      </div>
      <Loaded loadable={result}>
        {({ courses, assignedIds }) => {
          const shown = courses.filter(
            (c) => (!level || c.level === level) && (!mine || assignedIds.has(c.id)),
          );
          return shown.length === 0 ? (
            <EmptyState title="No courses match">
              Try another level, or turn off “Assigned to me”.
            </EmptyState>
          ) : (
            <ul className="course-grid">
              {shown.map((c) => {
                const n = countItems(c);
                return (
                  <Card as="li" key={c.id} className="course-card">
                    <div className="course-card__chips">
                      <Chip tone="neutral">{LEVELS[c.level]}</Chip>
                      {c.status === 'archived' ? <Chip tone="warning">Retired</Chip> : null}
                      {assignedIds.has(c.id) ? <Chip tone="accent">Assigned</Chip> : null}
                    </div>
                    <h2 className="course-card__title">
                      <Link to={`/courses/${c.id}`}>{c.title}</Link>
                    </h2>
                    <p>{c.summary}</p>
                    <p className="course-card__meta">
                      {n.lessons} lessons · {n.parikshas} Parikshas · {c.estimatedMinutes} min
                    </p>
                  </Card>
                );
              })}
            </ul>
          );
        }}
      </Loaded>
    </main>
  );
}

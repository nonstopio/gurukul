import {
  Button,
  Card,
  Chip,
  EmptyState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  SegmentedControl,
  Select,
} from '@gurukul/ui';
import { useCallback, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useSession, useUser } from './auth/AuthProvider';
import { useLearnerData } from './data/DataProvider';
import { useAsync } from './data/useAsync';
import {
  DEFAULT_QUERY,
  SORT_LABELS,
  VIEW_LABELS,
  VISIBILITY_LABELS,
  applyQuery,
  isFiltered,
  openable,
  parseQuery,
  queryParams,
} from './learn/catalogue';
import type { CatalogueQuery, CatalogueSort, CatalogueView } from './learn/catalogue';
import { LEVEL_LABELS, countItems, isRetired } from './learn/model';
import { CoverTile, Loaded } from './learn/ui';
import { useTerms } from './labels/useTerms';

/**
 * The courses the person may open, with search, view chips (All, Assigned to me, In progress,
 * Completed), level, sort and a visible result count. The filters live in the URL. Self-enrolment:
 * every course listed is open.
 */
export function CoursesPage() {
  const data = useLearnerData();
  const uid = useUser().uid;
  const { roles, teamIds } = useSession();
  const staff = roles.includes('educator') || roles.includes('admin');
  const t = useTerms();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => parseQuery(params), [params]);
  const change = (next: Partial<CatalogueQuery>) =>
    setParams(queryParams({ ...query, ...next }), { replace: true });
  const clear = () =>
    setParams(queryParams({ ...DEFAULT_QUERY, sort: query.sort }), { replace: true });

  const teamKey = teamIds.join(',');
  const load = useCallback(async () => {
    const who = { teamIds: teamKey === '' ? [] : teamKey.split(','), staff };
    const [listed, assignments, progress] = await Promise.all([
      data.listCourses(who),
      data.myAssignments(uid),
      data.myProgress(uid),
    ]);
    return {
      courses: openable(listed, who),
      assignedIds: new Set(assignments.map((a) => a.courseId)),
      progress,
    };
  }, [data, uid, teamKey, staff]);
  const result = useAsync(load);
  const shown =
    result.state === 'ready' ? applyQuery(result.value.courses, query, result.value) : [];
  const filtered = isFiltered(query);

  return (
    <Page>
      <PageHeader
        title="Course catalogue"
        lead="Every course you can open is here. Pick one and start."
      />
      <FilterBar
        label="Filter courses"
        count={
          result.state === 'ready'
            ? `${shown.length} of ${result.value.courses.length} courses`
            : undefined
        }
        canClear={filtered}
        onClear={clear}
        clearLabel="Clear all filters"
      >
        <Input
          label="Search courses"
          hideLabel
          type="search"
          placeholder="Search courses"
          value={query.q}
          onChange={(e) => change({ q: e.target.value })}
        />
        <SegmentedControl<CatalogueView>
          label="Show"
          value={query.view}
          options={Object.entries(VIEW_LABELS).map(([value, label]) => ({
            value: value as CatalogueView,
            label,
          }))}
          onChange={(view) => change({ view })}
        />
        <Select
          label="Level"
          hideLabel
          value={query.level}
          onChange={(e) => change({ level: e.target.value as CatalogueQuery['level'] })}
        >
          <option value="">Any level</option>
          {Object.entries(LEVEL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Select
          label="Sort by"
          hideLabel
          value={query.sort}
          onChange={(e) => change({ sort: e.target.value as CatalogueSort })}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </FilterBar>
      <Loaded loadable={result}>
        {({ courses, assignedIds }) =>
          courses.length === 0 ? (
            <EmptyState title="No courses to show yet" headingAs="h2">
              Courses appear here as soon as an {t.Educator} publishes one you can open.
            </EmptyState>
          ) : shown.length === 0 ? (
            <EmptyState
              title="No courses match"
              headingAs="h2"
              action={
                <Button variant="secondary" onClick={clear}>
                  Clear all filters
                </Button>
              }
            >
              Try other words, another level, or a different view.
            </EmptyState>
          ) : (
            <ul className="learn-cards g-stagger">
              {shown.map((c, i) => {
                const n = countItems(c);
                return (
                  <Card
                    as="li"
                    key={c.id}
                    className="course-card"
                    style={{ '--i': i } as CSSProperties}
                  >
                    <CoverTile cover={c.cover} size="large" />
                    <span className="learn-chips">
                      <Chip tone="neutral">{LEVEL_LABELS[c.level]}</Chip>
                      <Chip tone={c.visibility === 'public' ? 'neutral' : 'info'}>
                        {VISIBILITY_LABELS[c.visibility ?? 'public']}
                      </Chip>
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

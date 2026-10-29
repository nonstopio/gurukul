import { Card, Chip, EmptyState, Tabs, Button } from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { countItems } from '../learn/model';
import { Loaded } from '../learn/ui';
import { NewCourseDialog } from './NewCourseDialog';
import { useStudio } from './StudioProvider';
import type { StudioCourse } from './types';
import {
  acharyaSummary,
  canEdit,
  inTab,
  relativeTime,
  tabCounts,
  unpublishedEdits,
} from './studioModel';
import type { CourseTab } from './studioModel';

const STATUS = {
  published: { tone: 'accent', label: 'Published' },
  draft: { tone: 'neutral', label: 'Draft' },
  archived: { tone: 'warning', label: 'Archived' },
} as const;

/** `/studio`: every course the person can see; the ones they may edit open in the course editor. */
export function StudioCoursesPage() {
  const { data } = useStudio();
  const { uid } = useUser();
  const kulapati = useSession().roles.includes('kulapati');
  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date());
  const result = useAsync(
    useCallback(() => data.listCourses(uid, kulapati), [data, uid, kulapati]),
  );
  const rows = result.state === 'ready' ? result.value : [];
  const editable = rows.filter((r) => canEdit(r.live, uid, kulapati)).map((r) => r.live);

  return (
    <main className="page studio-page">
      <header className="sc-head">
        <div>
          <p className="sc-kicker">Vyasa Studio</p>
          <h1 className="page__title sc-head__title">Courses</h1>
          <p className="sc-head__line">
            Compose courses the way Vyasa composed the epic — parva by parva.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New course</Button>
      </header>
      <Loaded loadable={result}>
        {(list) => (
          <CourseTabs
            rows={list}
            uid={uid}
            kulapati={kulapati}
            now={now}
            onNew={() => setCreating(true)}
          />
        )}
      </Loaded>
      <NewCourseDialog open={creating} onClose={() => setCreating(false)} editable={editable} />
    </main>
  );
}

function CourseTabs({
  rows,
  uid,
  kulapati,
  now,
  onNew,
}: {
  rows: StudioCourse[];
  uid: string;
  kulapati: boolean;
  now: Date;
  onNew: () => void;
}) {
  const counts = tabCounts(rows);
  const [tab, setTab] = useState<CourseTab>('all');
  const panel = (id: CourseTab, empty: string) => {
    if (id !== tab) return null;
    const shown = rows.filter((r) => inTab(r, id));
    return shown.length === 0 ? (
      <EmptyState title={empty} headingAs="h2" action={<Button onClick={onNew}>New course</Button>}>
        Start a blank course, or duplicate one you already have.
      </EmptyState>
    ) : (
      <ul className="sc-grid">
        {shown.map((row) => (
          <CourseCard key={row.live.id} row={row} uid={uid} kulapati={kulapati} now={now} />
        ))}
        <li>
          <button type="button" className="sc-new" onClick={onNew}>
            <span className="sc-new__plus" aria-hidden="true">
              +
            </span>
            <span className="sc-new__title">Start a new course</span>
            <span className="sc-new__text">Blank, or duplicate an existing one</span>
          </button>
        </li>
      </ul>
    );
  };
  const tabs: [TabItem, ...TabItem[]] = [
    { id: 'all', label: `All (${counts.all})`, panel: panel('all', 'No courses yet') },
    {
      id: 'published',
      label: `Published (${counts.published})`,
      panel: panel('published', 'Nothing is published yet'),
    },
    { id: 'drafts', label: `Drafts (${counts.drafts})`, panel: panel('drafts', 'No drafts') },
  ];
  return (
    <Tabs
      label="Course status"
      tabs={tabs}
      value={tab}
      onValueChange={(v) => setTab(v as CourseTab)}
    />
  );
}

function CourseCard({
  row,
  uid,
  kulapati,
  now,
}: {
  row: StudioCourse;
  uid: string;
  kulapati: boolean;
  now: Date;
}) {
  const { live, draft } = row;
  const shown = draft?.course ?? live;
  const status = STATUS[live.status];
  const editing = canEdit(live, uid, kulapati);
  const edits = unpublishedEdits(row);
  const shownCounts = countItems(shown);
  const acharyas = acharyaSummary(live);
  return (
    <li>
      <Card as="article" className="sc-card">
        <div className={`sc-card__cover sc-card__cover--${live.cover.theme}`}>
          <span className="sc-card__glyph" aria-hidden="true">
            {live.cover.glyph}
          </span>
          <Chip tone={status.tone} className="sc-card__status">
            {live.status === 'published' ? `${status.label} · v${live.version}` : status.label}
          </Chip>
        </div>
        <div className="sc-card__body">
          <h2 className="sc-card__title">
            {editing ? (
              <Link className="sc-card__link" to={`/studio/courses/${live.id}`}>
                {shown.title}
              </Link>
            ) : (
              shown.title
            )}
          </h2>
          <p className="sc-card__meta">
            {shown.parvas.length} parvas · {shownCounts.lessons} lessons · {shownCounts.parikshas}{' '}
            Parikshas
          </p>
          <div className="sc-card__foot">
            {editing ? (
              <>
                {edits ? (
                  <Chip tone="warning">
                    {`${edits} unpublished ${edits === 1 ? 'edit' : 'edits'}`}
                  </Chip>
                ) : null}
                {row.learners === undefined ? null : (
                  <span className="sc-card__edited">
                    {row.learners} {row.learners === 1 ? 'learner' : 'learners'}
                  </span>
                )}
                {draft?.updatedAt ? (
                  <span className="sc-card__edited">
                    Edited {relativeTime(draft.updatedAt, now)}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="sc-card__edited">
                <svg
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="7" width="10" height="6.5" rx="1.5" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>{' '}
                {acharyas ? `View only — ${acharyas.label}: ${acharyas.names}` : 'View only'}
              </span>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

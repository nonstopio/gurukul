import { Button, Card, Chip, EmptyState, LockIcon, Page, PageHeader, Tabs } from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { countItems } from '../learn/model';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { NewCourseDialog } from './NewCourseDialog';
import { useStudio } from './StudioProvider';
import type { StudioCourse } from './types';
import {
  educatorSummary,
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
  const admin = useSession().roles.includes('admin');
  const [creating, setCreating] = useState(false);
  const t = useTerms();
  const [now] = useState(() => new Date());
  const result = useAsync(useCallback(() => data.listCourses(uid, admin), [data, uid, admin]));
  const rows = result.state === 'ready' ? result.value : [];
  const editable = rows.filter((r) => canEdit(r.live, uid, admin)).map((r) => r.live);

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Studio}
        title="Courses"
        lead={`Build courses ${t.chapter} by ${t.chapter}.`}
        actions={<Button onClick={() => setCreating(true)}>New course</Button>}
      />
      <Loaded loadable={result}>
        {(list) => (
          <CourseTabs
            rows={list}
            uid={uid}
            admin={admin}
            now={now}
            onNew={() => setCreating(true)}
          />
        )}
      </Loaded>
      <NewCourseDialog open={creating} onClose={() => setCreating(false)} editable={editable} />
    </Page>
  );
}

function CourseTabs({
  rows,
  uid,
  admin,
  now,
  onNew,
}: {
  rows: StudioCourse[];
  uid: string;
  admin: boolean;
  now: Date;
  onNew: () => void;
}) {
  const counts = tabCounts(rows);
  const [tab, setTab] = useState<CourseTab>('all');
  const panel = (id: CourseTab, empty: string) => {
    if (id !== tab) return null;
    const shown = rows.filter((r) => inTab(r, id));
    return shown.length === 0 ? (
      <EmptyState
        title={empty}
        headingAs="h2"
        action={
          <Button variant="secondary" onClick={onNew}>
            New course
          </Button>
        }
      >
        Start a blank course, or duplicate one you already have.
      </EmptyState>
    ) : (
      <ul className="sc-grid">
        {shown.map((row) => (
          <CourseCard key={row.live.id} row={row} uid={uid} admin={admin} now={now} />
        ))}
        <li className="sc-new">
          <Button variant="secondary" onClick={onNew}>
            Start a new course
          </Button>
          <p className="sc-card__meta">Blank, or duplicate an existing one</p>
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
  admin,
  now,
}: {
  row: StudioCourse;
  uid: string;
  admin: boolean;
  now: Date;
}) {
  const { live, draft } = row;
  const shown = draft?.course ?? live;
  const status = STATUS[live.status];
  const editing = canEdit(live, uid, admin);
  const edits = unpublishedEdits(row);
  const shownCounts = countItems(shown);
  const t = useTerms();
  const educators = educatorSummary(live, t);
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
            {`${shown.chapters.length} ${t.chapters} · ${shownCounts.lessons} lessons · ${shownCounts.quizzes} ${t.Quizzes}`}
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
                    {`${row.learners} ${row.learners === 1 ? t.learner : t.learners}`}
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
                <LockIcon size={14} />{' '}
                {educators ? `View only — ${educators.label}: ${educators.names}` : 'View only'}
              </span>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

import {
  Button,
  Chip,
  CourseTile,
  EmptyState,
  LockIcon,
  Page,
  PageHeader,
  Pagination,
  Tabs,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useAsync } from '../data/useAsync';
import { courseImageUrl } from '../learn/model';
import { CourseLimitNotice, Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { pageFor } from '../paging';
import { useTabParam } from '../useTabParam';
import { NewCourseDialog } from './NewCourseDialog';
import { useStudio } from './StudioProvider';
import type { CourseListing } from '@gurukul/schema';
import { educatorSummary, canEdit, inTab, tabCounts } from './studioModel';
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
  // Summaries only: no course and no draft is read until an editor opens.
  const result = useAsync(useCallback(() => data.listLiveCourses(), [data]));
  const rows = result.state === 'ready' ? result.value : [];
  const editable = rows.filter((r) => canEdit(r, uid, admin));

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={t.Studio}
        title={t.Courses}
        lead={`Build courses ${t.chapter} by ${t.chapter}.`}
        actions={<Button onClick={() => setCreating(true)}>New course</Button>}
      />
      <Loaded loadable={result}>
        {(list) => (
          <>
            <CourseLimitNotice courses={list} />
            <CourseTabs rows={list} uid={uid} admin={admin} onNew={() => setCreating(true)} />
          </>
        )}
      </Loaded>
      <NewCourseDialog open={creating} onClose={() => setCreating(false)} editable={editable} />
    </Page>
  );
}

const COURSE_TAB_IDS = ['all', 'published', 'drafts'] as const;

function CourseTabs({
  rows,
  uid,
  admin,
  onNew,
}: {
  rows: CourseListing[];
  uid: string;
  admin: boolean;
  onNew: () => void;
}) {
  const counts = tabCounts(rows);
  const [tab, setTab] = useTabParam(COURSE_TAB_IDS);
  const [page, setPage] = useState(1);
  const panel = (id: CourseTab, empty: string) => {
    if (id !== tab) return null;
    const shown = rows.filter((r) => inTab(r, id));
    const paged = pageFor(shown, page);
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
      <>
        <ul className="sc-grid">
          {paged.rows.map((row) => (
            <CourseCard key={row.id} live={row} uid={uid} admin={admin} />
          ))}
          <li className="sc-new">
            <Button variant="secondary" onClick={onNew}>
              Start a new course
            </Button>
            <p className="sc-new__hint">Blank, or duplicate an existing one</p>
          </li>
        </ul>
        <Pagination label="Courses" page={paged.page} total={shown.length} onPageChange={setPage} />
      </>
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
      onValueChange={(v) => {
        setTab(v as CourseTab);
        setPage(1);
      }}
    />
  );
}

/**
 * One course, drawn from its summary. For a course the person may edit, and only once its card is
 * on screen, two small reads add what the summary cannot know: whether the draft has edits not yet
 * published, and how many learners started it (`courseFacts`).
 */
function CourseCard({ live, uid, admin }: { live: CourseListing; uid: string; admin: boolean }) {
  const { data } = useStudio();
  const status = STATUS[live.status];
  const editing = canEdit(live, uid, admin);
  const t = useTerms();
  const { id, publishedAt } = live;
  const loaded = useAsync(
    useCallback(
      async () => (editing ? await data.courseFacts(id, publishedAt) : null),
      [data, editing, id, publishedAt],
    ),
  );
  const facts = loaded.state === 'ready' ? loaded.value : null;
  const educators = educatorSummary({ ...live, educatorNames: live.educatorNames ?? {} }, t);
  return (
    <CourseTile
      as="li"
      title={live.title}
      heading={editing ? <Link to={`/studio/courses/${live.id}`}>{live.title}</Link> : live.title}
      image={courseImageUrl(live)}
      theme={live.cover.theme}
      chips={
        <>
          <Chip tone={status.tone}>
            {live.status === 'published' ? `${status.label} · v${live.version}` : status.label}
          </Chip>
          {facts?.edited ? <Chip tone="warning">Unpublished edits</Chip> : null}
        </>
      }
      summary={
        live.status === 'draft'
          ? 'Not published yet. Open it to see the draft.'
          : `${live.chapters} ${t.chapters} · ${live.lessons} lessons · ${live.quizzes} ${t.Quizzes}`
      }
      meta={
        editing ? (
          facts && facts.learners !== null ? (
            <span className="sc-facts">
              <span>{`${facts.learners} ${facts.learners === 1 ? t.learner : t.learners}`}</span>
            </span>
          ) : null
        ) : (
          <span className="sc-facts">
            <span>
              <LockIcon size={14} />{' '}
              {educators ? `View only — ${educators.label}: ${educators.names}` : 'View only'}
            </span>
          </span>
        )
      }
    />
  );
}

import {
  Button,
  Callout,
  Chip,
  EmptyState,
  Page,
  PageSkeleton,
  Tabs,
  TopBar,
  buttonClass,
  useToast,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { itemsOf } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { AnalyticsTab } from './AnalyticsTab';
import { DetailsPanel } from './DetailsPanel';
import { StudioBack } from './DraftGate';
import { CertificateTab, LandingTab } from './LandingTab';
import { PublishDialog } from './PublishDialog';
import { StructureTab } from './StructureTab';
import { educatorSummary, canEdit, nameOf } from './studioModel';
import { LeaveGuard, RestoreNotice } from './UnsavedGuard';
import { useSaveLabel } from './saveLabel';
import { useDraft } from './useDraft';
import { VersionsTab } from './VersionsTab';

type TabId = 'structure' | 'landing' | 'certificate' | 'analytics' | 'versions';

/** A course editor state that is not the editor itself: the top bar with its title, then a page. */
function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <TopBar title={title} back={<StudioBack />} />
      <Page width="reading">{children}</Page>
    </>
  );
}

function BackToStudio() {
  return (
    <p>
      <Link className={buttonClass('secondary')} to="/studio">
        {`Back to ${useTerms().Studio}`}
      </Link>
    </p>
  );
}

/** `/studio/courses/:courseId`: gates on who may edit, then opens the draft editor. */
export function CourseEditorPage() {
  const { courseId = '' } = useParams();
  const learner = useLearnerData();
  const { uid } = useUser();
  const admin = useSession().roles.includes('admin');
  const t = useTerms();
  const result = useAsync(useCallback(() => learner.getCourse(courseId), [learner, courseId]));
  const body = (
    <Loaded loadable={result}>{(live) => <Gate live={live} uid={uid} admin={admin} />}</Loaded>
  );
  // Until the course arrives the page has no title of its own, so the bar names the area.
  return result.state === 'ready' ? body : <Frame title={t.Studio}>{body}</Frame>;
}

function Gate({ live, uid, admin }: { live: Course | null; uid: string; admin: boolean }) {
  const t = useTerms();
  if (!live) {
    return (
      <Frame title="Course not found">
        <EmptyState
          title="This course does not exist"
          headingAs="h2"
          action={
            <Link className={buttonClass('secondary')} to="/studio">
              {`Back to ${t.Studio}`}
            </Link>
          }
        >
          It may have been removed, or the address is wrong.
        </EmptyState>
      </Frame>
    );
  }
  if (!canEdit(live, uid, admin)) {
    const educators = educatorSummary(live, t);
    return (
      <Frame title={live.title}>
        <Callout tone="note" title="View only">
          <p>
            {`You are not one of this course's ${t.Educators}, so you can read it but not change it. Ask ${article(t.Admin)} for edit access.`}
          </p>
          {educators ? (
            <p>
              {educators.label}: {educators.names}.
            </p>
          ) : null}
        </Callout>
        <BackToStudio />
      </Frame>
    );
  }
  return <Editor key={live.id} initial={live} admin={admin} />;
}

function Editor({ initial, admin }: { initial: Course; admin: boolean }) {
  const courseId = initial.id;
  const draft = useDraft(courseId);
  const label = useSaveLabel(draft);
  const learner = useLearnerData();
  const toast = useToast();
  const t = useTerms();
  const [live, setLive] = useState(initial);
  const [tab, setTab] = useState<TabId>('structure');
  const [publishing, setPublishing] = useState(false);

  const refreshLive = async (fallback: Partial<Course>) => {
    const fresh = await learner.getCourse(courseId).catch(() => {
      log.warn('Reloading the live course failed', { courseId });
      return null;
    });
    setLive(fresh ?? { ...live, ...fallback });
  };

  const name = nameOf(live.title, 'Untitled course');
  if (draft.status === 'loading') {
    return (
      <>
        <TopBar title={name} back={<StudioBack />} />
        <PageSkeleton width="wide" label="Loading the draft" />
      </>
    );
  }
  if (draft.status === 'error' || draft.status === 'missing' || !draft.work) {
    return (
      <Frame title={name}>
        {draft.status === 'missing' ? (
          <EmptyState title="There is no draft for this course" headingAs="h2">
            {`The draft is created with the course. Ask ${article(t.Admin)} to check it.`}
          </EmptyState>
        ) : (
          <Callout tone="warning" title="The draft did not load" role="alert">
            <p>Check your connection, then try again.</p>
            <Button variant="secondary" onClick={draft.reload}>
              Try again
            </Button>
          </Callout>
        )}
        <BackToStudio />
      </Frame>
    );
  }

  const { work, update } = draft;
  const course = work.course;
  const published = live.version > 0;
  const first = itemsOf(course)[0];

  const openPublish = async () => {
    if (await draft.saveNow()) setPublishing(true);
    else toast.show('Save your changes before publishing.', { tone: 'danger' });
  };

  const status =
    draft.save === 'error' ? (
      <span role="status">
        Couldn&apos;t save —{' '}
        <Button variant="chrome-secondary" size="sm" onClick={() => void draft.saveNow()}>
          retry
        </Button>
      </span>
    ) : (
      <span role="status">{draft.save === 'conflict' ? `${label} · not saved` : label}</span>
    );

  const tabs: [TabItem, ...TabItem[]] = [
    {
      id: 'structure',
      label: 'Structure',
      panel: (
        <div className="sc-editor">
          <StructureTab course={course} live={published ? live : null} update={update} />
          <DetailsPanel course={course} educators={live} update={update} />
        </div>
      ),
    },
    {
      id: 'landing',
      label: 'Landing page',
      panel: tab === 'landing' ? <LandingTab course={course} update={update} /> : null,
    },
    {
      id: 'certificate',
      label: 'Certificate',
      panel: tab === 'certificate' ? <CertificateTab course={course} update={update} /> : null,
    },
    {
      id: 'analytics',
      label: 'Analytics',
      panel:
        tab === 'analytics' ? (
          <AnalyticsTab courseId={courseId} published={published} admin={admin} />
        ) : null,
    },
    {
      id: 'versions',
      label: 'Versions',
      panel:
        tab === 'versions' ? (
          <VersionsTab
            course={live}
            admin={admin}
            onRolledBack={(version) => {
              draft.reload();
              void refreshLive({ version, status: 'published' });
            }}
            onArchived={(status) => setLive({ ...live, status })}
          />
        ) : null,
    },
  ];

  return (
    <>
      <TopBar
        title={course.title || 'Untitled course'}
        back={<StudioBack />}
        status={
          <div className="sc-status">
            <Chip tone={published ? 'accent' : 'neutral'}>
              {published ? `Live: v${live.version}` : 'Not published'}
            </Chip>
            {status}
          </div>
        }
        actions={
          <>
            {first ? (
              <Link
                className={buttonClass('chrome-secondary')}
                to={`/studio/courses/${courseId}/preview/${first.id}`}
              >
                {`Preview as ${t.learner}`}
              </Link>
            ) : (
              <Button
                variant="chrome-secondary"
                disabled
                title="Add a lesson to preview the course"
              >
                {`Preview as ${t.learner}`}
              </Button>
            )}
            <Button variant="chrome" onClick={() => void openPublish()}>
              Publish v{live.version + 1}
            </Button>
          </>
        }
      />
      <LeaveGuard draft={draft} />
      <Page width="wide">
        <RestoreNotice draft={draft} />
        {draft.save === 'conflict' ? (
          <Callout tone="warning" title="Someone else saved this draft" role="alert">
            <p>Someone else saved this draft. Reload to continue.</p>
            <Button variant="secondary" onClick={draft.reload}>
              Reload
            </Button>
          </Callout>
        ) : null}
        <Tabs
          label="Course sections"
          tabs={tabs}
          value={tab}
          onValueChange={(id) => setTab(id as TabId)}
        />
      </Page>
      {publishing ? (
        <PublishDialog
          work={work}
          live={published ? live : null}
          onClose={() => setPublishing(false)}
          onPublished={(version) => {
            draft.reload();
            void refreshLive({ version, status: 'published' });
          }}
        />
      ) : null}
    </>
  );
}

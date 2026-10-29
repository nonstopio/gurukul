import {
  Button,
  Callout,
  Chip,
  EmptyState,
  Skeleton,
  Tabs,
  TopBar,
  buttonClass,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import type { TabItem } from '@gurukul/ui';
import { itemsOf } from '@gurukul/schema';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useSession, useUser } from '../auth/AuthProvider';
import { useLearnerData } from '../data/DataProvider';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { log } from '../log';
import { AnalyticsTab } from './AnalyticsTab';
import { DetailsPanel } from './DetailsPanel';
import { CertificateTab, LandingTab } from './LandingTab';
import { PublishDialog } from './PublishDialog';
import { StructureTab } from './StructureTab';
import { acharyaSummary, canEdit } from './studioModel';
import { LeaveGuard, RestoreNotice } from './UnsavedGuard';
import { useSaveLabel } from './saveLabel';
import { useDraft } from './useDraft';
import { VersionsTab } from './VersionsTab';

type TabId = 'structure' | 'landing' | 'certificate' | 'analytics' | 'versions';

const back = (
  <Link className={topBarBackClass} to="/studio">
    Vyasa Studio
  </Link>
);

/** `/studio/courses/:courseId`: gates on who may edit, then opens the draft editor. */
export function CourseEditorPage() {
  const { courseId = '' } = useParams();
  const learner = useLearnerData();
  const { uid } = useUser();
  const kulapati = useSession().roles.includes('kulapati');
  const result = useAsync(useCallback(() => learner.getCourse(courseId), [learner, courseId]));

  return (
    <Loaded loadable={result}>
      {(live) => {
        if (!live) {
          return (
            <main className="page">
              <EmptyState
                title="This course does not exist"
                headingAs="h2"
                action={
                  <Link className={buttonClass('secondary')} to="/studio">
                    Back to Vyasa Studio
                  </Link>
                }
              >
                It may have been removed, or the address is wrong.
              </EmptyState>
            </main>
          );
        }
        if (!canEdit(live, uid, kulapati)) {
          const acharyas = acharyaSummary(live);
          return (
            <main className="page">
              <h1 className="page__title">{live.title}</h1>
              <Callout tone="note" title="View only">
                <p>
                  You are not one of this course&apos;s Acharyas, so you can read it but not change
                  it. Ask a Kulapati for edit access.
                </p>
                {acharyas ? (
                  <p>
                    {acharyas.label}: {acharyas.names}.
                  </p>
                ) : null}
              </Callout>
              <p>
                <Link className={buttonClass('secondary')} to="/studio">
                  Back to Vyasa Studio
                </Link>
              </p>
            </main>
          );
        }
        return <Editor key={live.id} initial={live} kulapati={kulapati} />;
      }}
    </Loaded>
  );
}

function Editor({ initial, kulapati }: { initial: Course; kulapati: boolean }) {
  const courseId = initial.id;
  const draft = useDraft(courseId);
  const label = useSaveLabel(draft);
  const learner = useLearnerData();
  const toast = useToast();
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

  if (draft.status === 'loading') {
    return (
      <main className="page" aria-busy="true">
        <p role="status" className="sr-only">
          Loading the draft
        </p>
        <Skeleton shape="block" height={72} className="loading-row" />
        <Skeleton shape="block" height={72} className="loading-row" />
      </main>
    );
  }
  if (draft.status === 'error' || draft.status === 'missing' || !draft.work) {
    return (
      <main className="page">
        <h1 className="page__title">{live.title}</h1>
        {draft.status === 'missing' ? (
          <EmptyState title="There is no draft for this course" headingAs="h2">
            The draft is created with the course. Ask a Kulapati to check it.
          </EmptyState>
        ) : (
          <Callout tone="warning" title="The draft did not load" role="alert">
            <p>Check your connection, then try again.</p>
            <Button variant="secondary" onClick={draft.reload}>
              Try again
            </Button>
          </Callout>
        )}
        <p>
          <Link className={buttonClass('secondary')} to="/studio">
            Back to Vyasa Studio
          </Link>
        </p>
      </main>
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
        <Button variant="ghost" onClick={() => void draft.saveNow()}>
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
          <div className="sc-editor__main">
            <StructureTab course={course} live={published ? live : null} update={update} />
          </div>
          <DetailsPanel course={course} acharyas={live} update={update} />
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
          <AnalyticsTab courseId={courseId} published={published} kulapati={kulapati} />
        ) : null,
    },
    {
      id: 'versions',
      label: 'Versions',
      panel:
        tab === 'versions' ? (
          <VersionsTab
            course={live}
            kulapati={kulapati}
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
        back={back}
        status={
          <>
            <Chip tone={published ? 'accent' : 'neutral'}>
              {published ? `Live: v${live.version}` : 'Not published'}
            </Chip>
            {status}
          </>
        }
        actions={
          <>
            {first ? (
              <Link
                className={buttonClass('secondary')}
                to={`/studio/courses/${courseId}/preview/${first.id}`}
              >
                Preview as learner
              </Link>
            ) : (
              <Button variant="secondary" disabled title="Add a lesson to preview the course">
                Preview as learner
              </Button>
            )}
            <Button variant="chrome" onClick={() => void openPublish()}>
              Publish v{live.version + 1}
            </Button>
          </>
        }
      />
      <LeaveGuard draft={draft} />
      <main className="page studio-page">
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
      </main>
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

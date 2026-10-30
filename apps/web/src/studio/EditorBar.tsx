import {
  Breadcrumb,
  Button,
  Callout,
  ChevronLeftIcon,
  Page,
  TopBar,
  buttonClass,
  topBarBackClass,
  useToast,
} from '@gurukul/ui';
import type { BreadcrumbItem } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { LeaveGuard, RestoreNotice } from './UnsavedGuard';
import { useSaveLabel } from './saveLabel';
import type { DraftApi } from './useDraft';

/**
 * A focused editor's frame. The dark top bar: back to the course, the title (the page's `h1`), the
 * save state in words (Draft v3 · saved just now, saving…, unsaved changes, a retry button when
 * the save failed) and the page's actions. Under it, at wide width: where you are, the notices
 * (edits kept on this device, and Reload when someone else saved the draft first), then the page.
 */
export function EditorBar({
  title,
  back,
  crumbs,
  draft,
  actions,
  children,
}: {
  title: string;
  /** Where the back link goes, and its words. */
  back: { to: string; label: string };
  crumbs: BreadcrumbItem[];
  draft: Pick<
    DraftApi,
    | 'save'
    | 'rev'
    | 'savedAt'
    | 'saveNow'
    | 'reload'
    | 'backupAt'
    | 'restoreBackup'
    | 'discardBackup'
  >;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { save } = draft;
  const label = useSaveLabel(draft);
  const failed = save === 'error' || save === 'conflict';
  return (
    <>
      <TopBar
        title={title}
        back={
          <Link className={topBarBackClass} to={back.to}>
            <ChevronLeftIcon size={16} />
            {back.label}
          </Link>
        }
        status={
          <div className="sc-status" role="status">
            {failed ? (
              <Button
                variant="chrome-secondary"
                size="sm"
                disabled={save === 'conflict'}
                onClick={() => void draft.saveNow()}
              >
                Couldn&apos;t save — retry
              </Button>
            ) : (
              <>
                <span>{label}</span>
                <Button
                  variant="chrome-secondary"
                  size="sm"
                  disabled={save !== 'dirty'}
                  onClick={() => void draft.saveNow()}
                >
                  Save now
                </Button>
              </>
            )}
          </div>
        }
        actions={actions}
      />
      <LeaveGuard draft={draft} />
      <Page width="wide">
        <Breadcrumb items={crumbs} />
        <RestoreNotice draft={draft} />
        {save === 'conflict' ? (
          <Callout tone="warning" title="Someone else saved this course">
            <p>Reload to see their changes. Edits you made here since your last save are lost.</p>
            <Button variant="secondary" onClick={draft.reload}>
              Reload
            </Button>
          </Callout>
        ) : null}
        {children}
      </Page>
    </>
  );
}

/**
 * A link that saves the draft first, so the preview shows what is on screen. If the save fails it
 * stays put and says so, rather than opening a preview of older content.
 */
export function PreviewLink({
  draft,
  to,
  children,
}: {
  draft: Pick<DraftApi, 'saveNow'>;
  to: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Link
      className={buttonClass('chrome-secondary')}
      to={to}
      onClick={(e) => {
        e.preventDefault();
        void draft.saveNow().then((saved) => {
          if (saved) navigate(to);
          else
            toast.show("Couldn't save, so the preview would be out of date. Try saving again.", {
              tone: 'danger',
            });
        });
      }}
    >
      {children}
    </Link>
  );
}

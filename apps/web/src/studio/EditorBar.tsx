import { Breadcrumb, Button, Callout, buttonClass, useToast } from '@gurukul/ui';
import type { BreadcrumbItem } from '@gurukul/ui';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { DraftApi } from './useDraft';

const TEXT = { saved: 'Saved', saving: 'Saving…', dirty: 'Unsaved changes' } as const;

/**
 * The top of an editor: where you are, the save state in words (Saved, Saving…, Unsaved changes,
 * a retry button when the save failed), the page's actions, and the conflict notice with Reload
 * when someone else saved the draft first.
 */
export function EditorBar({
  crumbs,
  draft,
  actions,
}: {
  crumbs: BreadcrumbItem[];
  draft: Pick<DraftApi, 'save' | 'saveNow' | 'reload'>;
  actions?: ReactNode;
}) {
  const { save } = draft;
  const failed = save === 'error' || save === 'conflict';
  return (
    <>
      <div className="studio-bar">
        <Breadcrumb items={crumbs} />
        <div className="studio-bar__right">
          <div className="studio-save" role="status">
            {failed ? (
              <Button
                variant="secondary"
                disabled={save === 'conflict'}
                onClick={() => void draft.saveNow()}
              >
                Couldn&apos;t save — retry
              </Button>
            ) : (
              <>
                <span>{TEXT[save]}</span>
                <Button
                  variant="ghost"
                  disabled={save !== 'dirty'}
                  onClick={() => void draft.saveNow()}
                >
                  Save now
                </Button>
              </>
            )}
          </div>
          {actions}
        </div>
      </div>
      {save === 'conflict' ? (
        <Callout tone="warning" title="Someone else saved this course">
          <p>Reload to see their changes. Edits you made here since your last save are lost.</p>
          <Button variant="secondary" onClick={draft.reload}>
            Reload
          </Button>
        </Callout>
      ) : null}
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
      className={buttonClass('secondary')}
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

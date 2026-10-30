import { Button, Callout, Card, Chip, Dialog, EmptyState, useToast } from '@gurukul/ui';
import type { Course } from '@gurukul/schema';
import { useCallback, useState } from 'react';
import { toastError } from '../errors';
import { useAsync } from '../data/useAsync';
import { Loaded } from '../learn/ui';
import { useTerms } from '../labels/useTerms';
import { log } from '../log';
import { useStudio } from './StudioProvider';

/** Published versions, newest first, with roll back; and for an Admin, archive and restore. */
export function VersionsTab({
  course,
  admin,
  onRolledBack,
  onArchived,
}: {
  /** The live course. */
  course: Course;
  admin: boolean;
  /** Called with the new version after a roll back, so the editor can reload. */
  onRolledBack: (version: number) => void;
  onArchived: (status: 'archived' | 'published') => void;
}) {
  const { data, service } = useStudio();
  const toast = useToast();
  const t = useTerms();
  const [target, setTarget] = useState<number | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const result = useAsync(useCallback(() => data.listVersions(course.id), [data, course.id]));

  const fail = (what: string, error: unknown, fallback: string) => {
    log.error(what, error, { courseId: course.id });
    toastError(toast, error, fallback);
  };

  const rollBack = async (from: number) => {
    setBusy(true);
    try {
      const { version } = await service.rollbackCourse({ courseId: course.id, version: from });
      toast.show(`Version ${from} is live again, as v${version}.`, { tone: 'success' });
      setTarget(null);
      onRolledBack(version);
    } catch (e) {
      fail('Rolling back failed', e, 'Could not roll back. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const archive = async (archived: boolean) => {
    setBusy(true);
    try {
      const { status } = await service.archiveCourse({ courseId: course.id, archived });
      toast.show(status === 'archived' ? 'Course archived.' : 'Course restored.', {
        tone: 'success',
      });
      setArchiving(false);
      onArchived(status);
    } catch (e) {
      fail('Archiving failed', e, 'Could not change the course. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const archived = course.status === 'archived';
  return (
    <section className="sc-tab" aria-labelledby="versions-title">
      <h2 id="versions-title" className="sc-h2">
        Versions
      </h2>
      <Loaded loadable={result}>
        {(rows) =>
          rows.length === 0 ? (
            <EmptyState title="No earlier versions" headingAs="h3">
              Versions appear here each time you publish.
            </EmptyState>
          ) : (
            <Card>
              <ul className="sc-rows">
                {rows.map((row) => (
                  <li key={row.version} className="sc-row">
                    <span className="sc-version__no">v{row.version}</span>
                    <span className="sc-version__title">{row.title}</span>
                    <span className="sc-version__date">
                      {row.publishedAt ? row.publishedAt.toISOString().slice(0, 10) : 'No date'}
                    </span>
                    {row.version === course.version ? (
                      <Chip tone="accent">Live</Chip>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setTarget(row.version)}>
                        Roll back <span className="sr-only">to v{row.version}</span>
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )
        }
      </Loaded>

      {admin && course.status !== 'draft' ? (
        <Card
          className="sc-panel"
          title={archived ? 'This course is archived' : 'Retire this course'}
          titleAs="h3"
        >
          <p className="sc-help">
            {archived
              ? `${t.Learners} cannot open it. Restore it to make the live version available again.`
              : `Archiving hides it from the catalogue. ${t.Learners} who started it keep their progress.`}
          </p>
          {archived ? (
            <Button variant="secondary" loading={busy} onClick={() => void archive(false)}>
              Restore course
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setArchiving(true)}>
              Archive course
            </Button>
          )}
        </Card>
      ) : null}

      {target !== null ? (
        <Dialog
          open
          onClose={() => setTarget(null)}
          title={`Roll back to v${target}?`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTarget(null)}>
                Cancel
              </Button>
              <Button loading={busy} onClick={() => void rollBack(target)}>
                Roll back
              </Button>
            </>
          }
        >
          <p>
            {`Version ${target} is published again as a new version, and your draft is reset to it. ${t.Learners} keep their progress, matched by lesson id.`}
          </p>
          <Callout tone="warning" title="Unpublished edits are replaced">
            <p>Anything in your draft that is not in version {target} will be lost.</p>
          </Callout>
        </Dialog>
      ) : null}
      <Dialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title="Archive this course?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setArchiving(false)}>
              Keep it live
            </Button>
            <Button loading={busy} onClick={() => void archive(true)}>
              Archive course
            </Button>
          </>
        }
      >
        <p>It disappears from the catalogue. You can restore it here at any time.</p>
      </Dialog>
    </section>
  );
}

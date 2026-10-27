import { Button, Callout, Dialog, useToast } from '@gurukul/ui';
import { itemsOf, validateForPublish } from '@gurukul/schema';
import type { Course, PublishIssue } from '@gurukul/schema';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApiClientError, userMessageOf } from '../api';
import { log } from '../log';
import { useStudio } from './StudioProvider';
import { changeSummary, issuesFromDetails, itemEditorPath, nameOf } from './studioModel';
import type { Working } from './types';

/** The checklist before publishing: what changes for learners, and what must be fixed first. */
export function PublishDialog({
  work,
  live,
  onClose,
  onPublished,
}: {
  work: Working;
  /** The published copy, or null before the first publication. */
  live: Course | null;
  onClose: () => void;
  onPublished: (version: number) => void;
}) {
  const { service } = useStudio();
  const toast = useToast();
  const courseId = work.course.id;
  const next = (live?.version ?? 0) + 1;
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<PublishIssue[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const local = useMemo(() => validateForPublish(work.course, work.answers), [work]);
  const summary = useMemo(() => changeSummary(live, work.course), [live, work.course]);
  const issues = refused ?? local;
  const items = useMemo(() => itemsOf(work.course), [work.course]);
  const blocked = issues.length > 0;
  const nothing =
    live !== null &&
    !summary.courseChanged &&
    summary.added.length + summary.edited.length + summary.removed.length === 0;

  const publish = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { version } = await service.publishCourse({ courseId });
      toast.show(`Published v${version}. Learners see it now.`, { tone: 'success' });
      onPublished(version);
      onClose();
    } catch (e) {
      if (e instanceof ApiClientError && e.code === 'CRS_1003') {
        setRefused(issuesFromDetails(e.details));
        setFailure(e.userMessage);
      } else {
        log.error('Publishing failed', e, { courseId });
        setFailure(userMessageOf(e, 'Could not publish. Try again.'));
      }
      setBusy(false);
    }
  };

  const list = (title: string, names: string[]) =>
    names.length === 0 ? null : (
      <section className="sc-changes__group">
        <h3 className="sc-h3">
          {title} ({names.length})
        </h3>
        <ul>
          {names.map((n, i) => (
            // The same title can appear twice; position keeps the keys unique.
            <li key={`${i}-${n}`}>{nameOf(n, 'Untitled')}</li>
          ))}
        </ul>
      </section>
    );

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Publish v${next}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={blocked || busy} onClick={() => void publish()}>
            Publish v{next}
          </Button>
        </>
      }
    >
      {failure ? (
        <Callout tone="warning" title="Not published" role="alert">
          <p>{failure}</p>
        </Callout>
      ) : null}
      <section aria-labelledby="changes-title" className="sc-changes">
        <h3 id="changes-title" className="sc-h3">
          What changes for learners
        </h3>
        {live === null ? (
          <p>This is the first publication: everything in the draft goes live.</p>
        ) : nothing ? (
          <p>Nothing has changed since v{live.version}.</p>
        ) : (
          <>
            {summary.courseChanged ? <p>Course details or the order of parvas changed.</p> : null}
            {list('Added', summary.added)}
            {list('Edited', summary.edited)}
            {list('Removed', summary.removed)}
            {summary.removed.length > 0 ? (
              <p className="sc-help">
                Learners who completed a removed item keep their progress record.
              </p>
            ) : null}
          </>
        )}
      </section>
      {blocked ? (
        <section aria-labelledby="problems-title" className="sc-problems">
          <h3 id="problems-title" className="sc-h3">
            Fix these first ({issues.length})
          </h3>
          <ul>
            {issues.map((issue, i) => {
              const item = items.find((x) => x.id === issue.itemId);
              return (
                <li key={`${i}-${issue.code}`}>
                  {issue.message}
                  {item ? (
                    <>
                      {' '}
                      <Link to={itemEditorPath(courseId, item)}>
                        Open {nameOf(item.title, 'it')}
                      </Link>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </Dialog>
  );
}

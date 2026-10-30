import { Button, Callout, Dialog, useToast } from '@gurukul/ui';
import { diffCourses, itemsOf, validateForPublish } from '@gurukul/schema';
import type { Course, PublishIssue } from '@gurukul/schema';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ApiClientError, userMessageOf } from '../api';
import { useTerms } from '../labels/useTerms';
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
  const { service, data } = useStudio();
  const toast = useToast();
  const t = useTerms();
  const courseId = work.course.id;
  const next = (live?.version ?? 0) + 1;
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<PublishIssue[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const local = useMemo(() => validateForPublish(work.course, work.answers), [work]);
  const summary = useMemo(() => changeSummary(live, work.course), [live, work.course]);
  const removedIds = useMemo(() => diffCourses(live, work.course).removed, [live, work.course]);
  const [completions, setCompletions] = useState<Record<string, number>>({});
  const issues = refused ?? local;
  const items = useMemo(() => itemsOf(work.course), [work.course]);
  const blocked = issues.length > 0;
  const nothing =
    live !== null &&
    !summary.courseChanged &&
    summary.added.length + summary.edited.length + summary.removed.length === 0;

  // Removed lessons that learners can have completed: one count each, when the dialog opens.
  useEffect(() => {
    if (!live) return;
    const lessons = new Set(
      itemsOf(live)
        .filter((i) => i.type === 'lesson')
        .map((i) => i.id),
    );
    for (const id of removedIds.filter((r) => lessons.has(r))) {
      data
        .completedCount(courseId, id)
        .then((n) => setCompletions((c) => ({ ...c, [id]: n })))
        .catch(() => log.warn('Counting lesson completions failed', { courseId }));
    }
  }, [data, live, removedIds, courseId]);

  const publish = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const { version } = await service.publishCourse({ courseId });
      toast.show(`Published v${version}. ${t.Learners} see it now.`, { tone: 'success' });
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

  /** `ids` lines up with `names` for the removed group, whose lessons may carry a completion count. */
  const list = (title: string, names: string[], ids: string[] = []) =>
    names.length === 0 ? null : (
      <section className="sc-changes__group">
        <h3 className="sc-h3">
          {title} ({names.length})
        </h3>
        <ul>
          {names.map((n, i) => (
            // The same title can appear twice; position keeps the keys unique.
            <li key={`${i}-${n}`}>
              {nameOf(n, 'Untitled')}
              {completions[ids[i] as string] === undefined
                ? null
                : ` — ${completions[ids[i] as string]} completed`}
            </li>
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
          <Button disabled={blocked} loading={busy} onClick={() => void publish()}>
            Publish v{next}
          </Button>
        </>
      }
    >
      {live?.status === 'archived' ? (
        <Callout tone="warning" title="This course is archived">
          <p>
            {`Publishing makes it live again: ${t.learners} see it as current instead of Retired, and its ${t.Quizzes} open for them again.`}
          </p>
        </Callout>
      ) : null}
      {failure ? (
        <Callout tone="warning" title="Not published" role="alert">
          <p>{failure}</p>
        </Callout>
      ) : null}
      <section aria-labelledby="changes-title" className="sc-changes">
        <h3 id="changes-title" className="sc-h3">
          {`What changes for ${t.learners}`}
        </h3>
        {live === null ? (
          <p>This is the first publication: everything in the draft goes live.</p>
        ) : nothing ? (
          <p>Nothing has changed since v{live.version}.</p>
        ) : (
          <>
            {summary.courseChanged ? (
              <p>{`Course details or the order of ${t.chapters} changed.`}</p>
            ) : null}
            {list('Added', summary.added)}
            {list('Edited', summary.edited)}
            {list('Removed', summary.removed, removedIds)}
            {summary.removed.length > 0 ? (
              <p className="sc-help">
                {`${t.Learners} who completed a removed item keep their progress record.`}
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

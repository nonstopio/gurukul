import { itemsOf } from '@gurukul/schema';
import {
  Callout,
  Card,
  ChevronLeftIcon,
  EmptyState,
  Page,
  PageHeader,
  PageSkeleton,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { Link, useParams } from 'react-router';
import { BlockView } from '../player/blocks';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { PreviewExam } from './PreviewExam';
import { itemEditorPath, nameOf } from './studioModel';
import { useDraft } from './useDraft';
import { scrollIntoRail } from './scrollIntoRail';

const previewPath = (courseId: string, itemId: string) =>
  `/studio/courses/${courseId}/preview/${itemId}`;

/** `/studio/courses/:courseId/preview/:itemId`: the draft as a learner would see it. Nothing is saved. */
export function PreviewPage() {
  const { courseId = '', itemId = '' } = useParams();
  const draft = useDraft(courseId);
  const t = useTerms();
  const editor = `/studio/courses/${courseId}`;
  const back = (
    <Link className={topBarBackClass} to={editor}>
      <ChevronLeftIcon size={16} />
      Back to the editor
    </Link>
  );
  const title = `Preview as ${t.learner}`;

  if (draft.status === 'loading') {
    return (
      <>
        <TopBar title={title} back={back} />
        <PageSkeleton width="wide" label="Loading the preview" />
      </>
    );
  }
  if (draft.status !== 'ready' || !draft.work) {
    return (
      <>
        <TopBar title={title} back={back} />
        <Page width="reading">
          <EmptyState
            title={
              draft.status === 'missing'
                ? 'There is no draft to preview'
                : 'The preview did not load'
            }
            mascot={draft.status === 'missing' ? 'notFound' : 'error'}
            headingAs="h2"
            action={
              <Link className={buttonClass('secondary')} to="/studio">
                {`Back to ${t.Studio}`}
              </Link>
            }
          >
            {draft.status === 'missing'
              ? 'This course has no draft yet.'
              : 'You may not have access to this draft, or the connection dropped.'}
          </EmptyState>
        </Page>
      </>
    );
  }
  const { course, answers } = draft.work;
  const items = itemsOf(course);
  const index = items.findIndex((i) => i.id === itemId);
  const item = items[index];
  if (!item) {
    return (
      <>
        <TopBar title={title} back={back} />
        <Page width="reading">
          <EmptyState title="That item is not in this draft" headingAs="h2">
            It may have been deleted. Pick another from the editor.
          </EmptyState>
        </Page>
      </>
    );
  }
  const prev = items[index - 1];
  const next = items[index + 1];

  return (
    <>
      <TopBar
        title={`${title} · ${nameOf(course.title, 'Untitled course')}`}
        titleAs="p"
        back={back}
        actions={
          <Link className={buttonClass('chrome-secondary')} to={itemEditorPath(courseId, item)}>
            {`Edit this ${item.type === 'lesson' ? 'lesson' : t.Quiz}`}
          </Link>
        }
      />
      <Page width="wide">
        <Callout tone="note" title="Preview — progress is not saved" role="status">
          <p>{`This is your draft as ${article(t.learner)} would see it. Nothing you do here is recorded.`}</p>
        </Callout>
        <div className="sc-preview">
          <Card className="studio-rail">
            <nav aria-label="Course outline">
              <ol>
                {items.map((i) => (
                  <li key={i.id}>
                    <Link
                      to={previewPath(courseId, i.id)}
                      {...(i.id === itemId
                        ? { 'aria-current': 'page' as const, ref: scrollIntoRail }
                        : {})}
                    >
                      {nameOf(i.title, 'Untitled')}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </Card>
          <div className={item.type === 'lesson' ? `article article--${item.layout}` : 'article'}>
            <PageHeader
              eyebrow={`${item.type === 'lesson' ? 'Lesson' : t.Quiz} ${index + 1} of ${items.length}`}
              title={nameOf(item.title, 'Untitled')}
            />
            {item.type === 'lesson' ? (
              <>
                {item.blocks.length === 0 ? <p>This lesson is empty.</p> : null}
                {item.blocks.map((b) => (
                  <BlockView key={b.id} block={b} />
                ))}
              </>
            ) : (
              <PreviewExam
                key={item.id}
                quiz={item}
                answers={answers}
                editPath={itemEditorPath(courseId, item)}
              />
            )}
            <footer className="sc-preview__footer">
              {prev ? (
                <Link className={buttonClass('secondary')} to={previewPath(courseId, prev.id)}>
                  Previous
                </Link>
              ) : null}
              {next ? (
                <Link className={buttonClass('primary')} to={previewPath(courseId, next.id)}>
                  Next
                </Link>
              ) : null}
            </footer>
          </div>
        </div>
      </Page>
    </>
  );
}

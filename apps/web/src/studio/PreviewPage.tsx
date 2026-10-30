import { itemsOf } from '@gurukul/schema';
import type { AnswerKeys, Quiz } from '@gurukul/schema';
import {
  Button,
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
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { answerLetters } from '../quiz/model';
import { QuestionFields } from '../quiz/QuestionFields';
import { BlockView, Prose } from '../player/blocks';
import { article } from '../labels/terms';
import { useTerms } from '../labels/useTerms';
import { itemEditorPath, nameOf } from './studioModel';
import { useDraft } from './useDraft';

const previewPath = (courseId: string, itemId: string) =>
  `/studio/courses/${courseId}/preview/${itemId}`;

/** Whether the picked options are exactly the keyed ones. An empty key is never right. */
export function isCorrect(picked: readonly string[], key: readonly string[]): boolean {
  return key.length > 0 && picked.length === key.length && key.every((id) => picked.includes(id));
}

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
                      {...(i.id === itemId ? { 'aria-current': 'page' as const } : {})}
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
              <PreviewExam key={item.id} courseId={courseId} quiz={item} answers={answers} />
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

/** A Quiz, one question at a time, graded here against the draft's answer keys. */
function PreviewExam({
  courseId,
  quiz,
  answers,
}: {
  courseId: string;
  quiz: Quiz;
  answers: AnswerKeys;
}) {
  const t = useTerms();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const total = quiz.questions.length;
  const question = quiz.questions[index];

  if (total === 0) {
    return (
      <EmptyState
        title={`This ${t.Quiz} has no questions yet`}
        headingAs="h2"
        action={
          <Link className={buttonClass('secondary')} to={itemEditorPath(courseId, quiz)}>
            Add questions
          </Link>
        }
      >
        Add questions in the builder, then come back to try it.
      </EmptyState>
    );
  }
  if (!question) {
    const right = quiz.questions.filter((q) =>
      isCorrect(picked[q.id] as string[], answers[quiz.id]?.[q.id] ?? []),
    ).length;
    return (
      <div className="sc-exam">
        <Callout tone="tip" title="Preview finished" role="status">
          <p>{`You answered ${right} of ${total} correctly. This attempt was not recorded.`}</p>
        </Callout>
        <div className="sc-exam__actions">
          <Button
            variant="secondary"
            onClick={() => {
              setIndex(0);
              setPicked({});
              setChecked({});
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const key = answers[quiz.id]?.[question.id] ?? [];
  const mine = picked[question.id] ?? [];
  const done = checked[question.id] === true;
  const multiple = question.kind === 'multiple';
  const pick = (optionId: string, on: boolean) =>
    setPicked({
      ...picked,
      [question.id]: multiple
        ? on
          ? [...mine, optionId]
          : mine.filter((id) => id !== optionId)
        : [optionId],
    });
  const letters = answerLetters(
    question.options.map((o) => o.id),
    key,
  );
  const answerText = `the ${key.length > 1 ? 'answers are' : 'answer is'} ${letters}`;
  const stateOf = (id: string) => {
    if (!done) return 'idle' as const;
    if (key.includes(id)) return 'correct' as const;
    return mine.includes(id) ? ('incorrect' as const) : ('locked' as const);
  };

  return (
    <div className="sc-exam">
      <p className="studio-micro">
        Question {index + 1} of {total}
      </p>
      <QuestionFields question={question} picked={mine} stateOf={stateOf} onPick={pick} />
      {done ? (
        <div role="status">
          {key.length === 0 ? (
            <p>No correct answer is marked yet. Mark one in the builder.</p>
          ) : (
            <p>{isCorrect(mine, key) ? 'Correct.' : `Not quite — ${answerText}.`}</p>
          )}
          <Prose md={question.explanation} />
        </div>
      ) : null}
      <div className="sc-exam__actions">
        {done ? (
          <Button onClick={() => setIndex(index + 1)}>
            {index === total - 1 ? 'Finish preview' : 'Next question'}
          </Button>
        ) : (
          <Button
            disabled={mine.length === 0}
            onClick={() => setChecked({ ...checked, [question.id]: true })}
          >
            Check answer
          </Button>
        )}
      </div>
    </div>
  );
}

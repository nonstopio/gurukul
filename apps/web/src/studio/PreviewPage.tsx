import { itemsOf } from '@gurukul/schema';
import type { AnswerKeys, Pariksha } from '@gurukul/schema';
import {
  Button,
  Callout,
  EmptyState,
  QuizOption,
  Skeleton,
  TopBar,
  buttonClass,
  topBarBackClass,
} from '@gurukul/ui';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { BlockView, Prose } from '../player/blocks';
import { itemEditorPath, nameOf } from './studioModel';
import { useDraft } from './useDraft';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

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
  const editor = `/studio/courses/${courseId}`;
  const back = (
    <Link className={topBarBackClass} to={editor}>
      Back to the editor
    </Link>
  );

  if (draft.status === 'loading') {
    return (
      <main className="page" aria-busy="true">
        <p role="status" className="sr-only">
          Loading the preview
        </p>
        <Skeleton shape="block" height={72} className="loading-row" />
      </main>
    );
  }
  if (draft.status !== 'ready' || !draft.work) {
    return (
      <main className="page">
        <EmptyState
          title={
            draft.status === 'missing' ? 'There is no draft to preview' : 'The preview did not load'
          }
          headingAs="h2"
          action={
            <Link className={buttonClass('secondary')} to="/studio">
              Back to Vyasa Studio
            </Link>
          }
        >
          {draft.status === 'missing'
            ? 'This course has no draft yet.'
            : 'You may not have access to this draft, or the connection dropped.'}
        </EmptyState>
      </main>
    );
  }
  const { course, answers } = draft.work;
  const items = itemsOf(course);
  const index = items.findIndex((i) => i.id === itemId);
  const item = items[index];
  if (!item) {
    return (
      <>
        <TopBar title={course.title} back={back} />
        <main className="page">
          <EmptyState title="That item is not in this draft" headingAs="h2">
            It may have been deleted. Pick another from the editor.
          </EmptyState>
        </main>
      </>
    );
  }
  const prev = items[index - 1];
  const next = items[index + 1];

  return (
    <>
      <TopBar
        title={course.title}
        back={back}
        actions={
          <Link className={buttonClass('secondary')} to={itemEditorPath(courseId, item)}>
            Edit this {item.type === 'lesson' ? 'lesson' : 'Pariksha'}
          </Link>
        }
      />
      <div className="sc-banner">
        <Callout tone="note" title="Preview — progress is not saved" role="status">
          <p>This is your draft as a learner would see it. Nothing you do here is recorded.</p>
        </Callout>
      </div>
      <div className="player">
        <nav className="rail" aria-label="Course outline">
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
        <main className={item.type === 'lesson' ? `article article--${item.layout}` : 'article'}>
          <p className="article__kicker">
            {item.type === 'lesson' ? 'Lesson' : 'Pariksha'} {index + 1} of {items.length}
          </p>
          <h1 className="article__title">{nameOf(item.title, 'Untitled')}</h1>
          {item.type === 'lesson' ? (
            <>
              {item.blocks.length === 0 ? <p>This lesson is empty.</p> : null}
              {item.blocks.map((b) => (
                <BlockView key={b.id} block={b} />
              ))}
            </>
          ) : (
            <PreviewExam key={item.id} courseId={courseId} pariksha={item} answers={answers} />
          )}
          <footer className="article__footer">
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
        </main>
      </div>
    </>
  );
}

/** A Pariksha, one question at a time, graded here against the draft's answer keys. */
function PreviewExam({
  courseId,
  pariksha,
  answers,
}: {
  courseId: string;
  pariksha: Pariksha;
  answers: AnswerKeys;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const total = pariksha.questions.length;
  const question = pariksha.questions[index];

  if (total === 0) {
    return (
      <EmptyState
        title="This Pariksha has no questions yet"
        headingAs="h2"
        action={
          <Link className={buttonClass('secondary')} to={itemEditorPath(courseId, pariksha)}>
            Add questions
          </Link>
        }
      >
        Add questions in the builder, then come back to try it.
      </EmptyState>
    );
  }
  if (!question) {
    const right = pariksha.questions.filter((q) =>
      isCorrect(picked[q.id] as string[], answers[pariksha.id]?.[q.id] ?? []),
    ).length;
    return (
      <div className="exam">
        <Callout tone="tip" title="Preview finished" role="status">
          <p>{`You answered ${right} of ${total} correctly. This attempt was not recorded.`}</p>
        </Callout>
        <div className="exam__actions">
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

  const key = answers[pariksha.id]?.[question.id] ?? [];
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
  const stateOf = (id: string) => {
    if (!done) return 'idle' as const;
    if (key.includes(id)) return 'correct' as const;
    return mine.includes(id) ? ('incorrect' as const) : ('locked' as const);
  };

  return (
    <div className="exam">
      <p className="article__kicker">
        Question {index + 1} of {total}
      </p>
      <fieldset className="exam__question">
        <legend className="exam__prompt">{question.prompt}</legend>
        {question.code ? <pre className="exam__code">{question.code}</pre> : null}
        {question.options.map((option, i) => (
          <QuizOption
            key={option.id}
            name={question.id}
            value={option.id}
            letter={LETTERS[i % LETTERS.length] as (typeof LETTERS)[number]}
            multiple={multiple}
            checked={mine.includes(option.id)}
            state={stateOf(option.id)}
            onChange={(on) => pick(option.id, on)}
          >
            {option.text}
          </QuizOption>
        ))}
        {done ? (
          <div role="status" className="exam__feedback">
            {key.length === 0 ? (
              <p>No correct answer is marked yet. Mark one in the builder.</p>
            ) : (
              <p>{isCorrect(mine, key) ? 'Correct.' : 'Not quite.'}</p>
            )}
            <Prose md={question.explanation} />
          </div>
        ) : null}
      </fieldset>
      <div className="exam__actions">
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

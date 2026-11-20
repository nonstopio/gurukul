import type { AnswerKeys, Quiz } from '@gurukul/schema';
import { Button, Callout, EmptyState, Explanation, buttonClass } from '@gurukul/ui';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useTerms } from '../labels/useTerms';
import { Prose } from '../player/blocks';
import { answerLetters } from '../quiz/model';
import { QuestionFields } from '../quiz/QuestionFields';

/*
 * A Quiz as a learner meets it, graded here against answer keys the page already holds: Studio's
 * draft preview, and the session workspace's preview of its working copy. Nothing is recorded.
 */

/** Whether the picked options are exactly the keyed ones. An empty key is never right. */
export function isCorrect(picked: readonly string[], key: readonly string[]): boolean {
  return key.length > 0 && picked.length === key.length && key.every((id) => picked.includes(id));
}

/**
 * A Quiz, one question at a time. `editPath` is where an empty Quiz sends the person to add
 * questions (none: the empty state has no action); `markQuestion` wraps a question, so a session
 * can mark the ones it changed.
 */
export function PreviewExam({
  quiz,
  answers,
  editPath = null,
  markQuestion = (_id, question) => question,
}: {
  quiz: Quiz;
  answers: AnswerKeys;
  editPath?: string | null;
  markQuestion?: (questionId: string, question: ReactNode) => ReactNode;
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
          editPath ? (
            <Link className={buttonClass('secondary')} to={editPath}>
              Add questions
            </Link>
          ) : undefined
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
      {markQuestion(
        question.id,
        <QuestionFields question={question} picked={mine} stateOf={stateOf} onPick={pick} />,
      )}
      {done ? (
        <Explanation
          verdict={key.length === 0 ? 'neutral' : isCorrect(mine, key) ? 'correct' : 'incorrect'}
          title={
            key.length === 0
              ? 'No correct answer is marked yet. Mark one in the builder.'
              : isCorrect(mine, key)
                ? 'Correct.'
                : `Not quite — ${answerText}.`
          }
        >
          <Prose md={question.explanation} />
        </Explanation>
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

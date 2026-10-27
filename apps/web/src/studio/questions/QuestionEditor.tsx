import type { Lesson, PublishIssue } from '@gurukul/schema';
import { Button, Callout, Input, Select, Textarea } from '@gurukul/ui';
import { useState } from 'react';
import { patch } from '../patch';
import {
  KIND_LABELS,
  MAX_ANSWERS,
  MIN_ANSWERS,
  addAnswer,
  changeKind,
  parseTags,
  removeAnswer,
  setAnswerText,
  toggleCorrect,
} from '../questionEdit';
import type { Keyed, QuestionKind } from '../questionEdit';

const KINDS = Object.keys(KIND_LABELS) as QuestionKind[];

const messages = (issues: PublishIssue[], prefix: string): string | undefined =>
  issues
    .filter((i) => i.code.startsWith(prefix))
    .map((i) => i.message)
    .join(' ') || undefined;

/**
 * Edits one question: kind, prompt, optional code, the answers with their "correct" marks,
 * explanation, revisit link, and saving it to the shared question bank. Controlled: every change
 * goes out through `onEdit`, which receives a function of the question and its key.
 */
export function QuestionEditor({
  keyed,
  lessons,
  issues,
  insight,
  onEdit,
  onDelete,
  onSaveToBank,
}: {
  keyed: Keyed;
  lessons: Lesson[];
  issues: PublishIssue[];
  /** A sentence from the course stats about how learners fare on this question, when there is one. */
  insight: string | null;
  onEdit: (edit: (keyed: Keyed) => Keyed) => void;
  onDelete: () => void;
  onSaveToBank: (tags: string[]) => void;
}) {
  const { question, key } = keyed;
  const [tags, setTags] = useState('');
  const multiple = question.kind === 'multiple';
  const locked = question.kind === 'trueFalse';
  const answerIssue = messages(issues, 'question.options') ?? messages(issues, 'question.key');
  const edit = (change: (q: Keyed['question']) => Keyed['question']) =>
    onEdit((k) => ({ ...k, question: change(k.question) }));

  return (
    <div className="studio-question">
      <Select
        label="Question type"
        value={question.kind}
        onChange={(e) => onEdit((k) => changeKind(k, e.target.value as QuestionKind))}
      >
        {KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {KIND_LABELS[kind]}
          </option>
        ))}
      </Select>
      {insight ? (
        <Callout tone="tip" title="Learners find this hard">
          <p>{insight}</p>
        </Callout>
      ) : null}
      <Textarea
        label="Question (Markdown)"
        rows={3}
        value={question.prompt}
        error={messages(issues, 'question.prompt')}
        onChange={(e) => edit((q) => ({ ...q, prompt: e.target.value }))}
      />
      <Textarea
        label={question.kind === 'codeOutput' ? 'Code to read' : 'Code (optional)'}
        className="studio-mono"
        spellCheck={false}
        rows={question.kind === 'codeOutput' ? 6 : 3}
        value={question.code ?? ''}
        onChange={(e) => edit((q) => patch(q, { code: e.target.value || undefined }))}
      />
      <fieldset className="studio-answers">
        <legend className="studio-legend">
          Answers: {multiple ? 'tick every correct one' : 'choose the correct one'}
        </legend>
        {question.options.map((option, i) => {
          const correct = key.includes(option.id);
          return (
            <div
              className={`studio-answer${correct ? ' studio-answer--correct' : ''}`}
              key={option.id}
            >
              <input
                type={multiple ? 'checkbox' : 'radio'}
                name={`correct-${question.id}`}
                aria-label={`Answer ${i + 1} is correct`}
                checked={correct}
                onChange={() =>
                  onEdit((k) => ({ ...k, key: toggleCorrect(question.kind, k.key, option.id) }))
                }
              />
              <Input
                label={`Answer ${i + 1}`}
                value={option.text}
                readOnly={locked}
                onChange={(e) => edit((q) => setAnswerText(q, option.id, e.target.value))}
              />
              <Button
                variant="ghost"
                aria-label={`Remove answer ${i + 1}`}
                disabled={locked || question.options.length <= MIN_ANSWERS}
                onClick={() => onEdit((k) => removeAnswer(k, option.id))}
              >
                Remove
              </Button>
            </div>
          );
        })}
        {answerIssue ? (
          <p className="studio-error" role="alert">
            {answerIssue}
          </p>
        ) : null}
        <Button
          variant="ghost"
          disabled={locked || question.options.length >= MAX_ANSWERS}
          onClick={() => onEdit((k) => addAnswer(k))}
        >
          + Add answer
        </Button>
      </fieldset>
      <Textarea
        label="Explanation"
        hint="Shown to learners after they answer. Required."
        rows={3}
        value={question.explanation}
        error={messages(issues, 'question.explanation')}
        onChange={(e) => edit((q) => ({ ...q, explanation: e.target.value }))}
      />
      <Select
        label="Revisit link"
        hint="The lesson a learner is sent back to when they get this wrong."
        value={question.reviewItemId ?? ''}
        onChange={(e) => edit((q) => patch(q, { reviewItemId: e.target.value || undefined }))}
      >
        <option value="">No link</option>
        {lessons.map((l) => (
          <option key={l.id} value={l.id}>
            {l.title}
          </option>
        ))}
      </Select>
      <div className="studio-row studio-row--end">
        <Input
          label="Tags for the question bank"
          hint="Comma separated, for example git, branching"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Button variant="secondary" onClick={() => onSaveToBank(parseTags(tags))}>
          Save to question bank
        </Button>
      </div>
      <Button variant="ghost" onClick={onDelete}>
        Delete this question
      </Button>
    </div>
  );
}

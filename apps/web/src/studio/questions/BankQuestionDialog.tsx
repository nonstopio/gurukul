import { Button, Dialog, Input, Select, Textarea } from '@gurukul/ui';
import { useState } from 'react';
import { useTerms } from '../../labels/useTerms';
import {
  KIND_LABELS,
  MAX_ANSWERS,
  MIN_ANSWERS,
  addAnswer,
  bankEntry,
  changeKind,
  newQuestion,
  parseTags,
  questionProblems,
  removeAnswer,
  setAnswerText,
  toggleCorrect,
} from '../questionEdit';
import type { Keyed, QuestionKind } from '../questionEdit';
import type { BankQuestion } from '../types';

const KINDS: QuestionKind[] = ['single', 'multiple', 'trueFalse'];

/** A new question with nothing written yet: two empty answers, the first marked correct. */
function blank(): Keyed {
  const { question, key } = newQuestion();
  return {
    question: {
      ...question,
      prompt: '',
      options: question.options.map((o) => ({ ...o, text: '' })),
    },
    key,
  };
}

/**
 * Writes one question for the bank, or edits one: type, prompt, answers with the correct ones
 * marked, a topic tag and the explanation. `onSave` resolves when it is stored; the dialog stays
 * open (and the button shows it is working) until then, and `onSave` itself reports a failure.
 */
export function BankQuestionDialog({
  initial,
  onClose,
  onSave,
}: {
  /** The entry being edited; absent for a new question. */
  initial?: BankQuestion;
  onClose: () => void;
  onSave: (entry: Omit<BankQuestion, 'id' | 'createdBy'>) => Promise<void>;
}) {
  const t = useTerms();
  const [keyed, setKeyed] = useState<Keyed>(() =>
    initial ? { question: initial.question, key: initial.answers } : blank(),
  );
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const { question, key } = keyed;
  const multiple = question.kind === 'multiple';
  const locked = question.kind === 'trueFalse';
  const problems = attempted ? questionProblems(keyed) : {};
  const kinds = KINDS.includes(question.kind) ? KINDS : [...KINDS, question.kind];
  const edit = (change: (k: Keyed) => Keyed) => setKeyed(change);

  const save = async () => {
    setAttempted(true);
    if (Object.keys(questionProblems(keyed)).length > 0) return;
    setSaving(true);
    try {
      await onSave(bankEntry(keyed, parseTags(tags)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      title={initial ? 'Edit question' : 'New question'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            {initial ? 'Save changes' : 'Add to bank'}
          </Button>
        </>
      }
    >
      <div className="studio-question">
        <Select
          label="Question type"
          value={question.kind}
          onChange={(e) => edit((k) => changeKind(k, e.target.value as QuestionKind))}
        >
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
        <Textarea
          label="Question (Markdown)"
          rows={3}
          value={question.prompt}
          error={problems.prompt}
          onChange={(e) =>
            edit((k) => ({ ...k, question: { ...k.question, prompt: e.target.value } }))
          }
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
                    edit((k) => ({ ...k, key: toggleCorrect(k.question.kind, k.key, option.id) }))
                  }
                />
                <Input
                  label={`Answer ${i + 1}`}
                  value={option.text}
                  readOnly={locked}
                  onChange={(e) =>
                    edit((k) => ({
                      ...k,
                      question: setAnswerText(k.question, option.id, e.target.value),
                    }))
                  }
                />
                <Button
                  variant="ghost"
                  aria-label={`Remove answer ${i + 1}`}
                  disabled={locked || question.options.length <= MIN_ANSWERS}
                  onClick={() => edit((k) => removeAnswer(k, option.id))}
                >
                  Remove
                </Button>
              </div>
            );
          })}
          {problems.answers ? (
            <p className="studio-error" role="alert">
              {problems.answers}
            </p>
          ) : null}
          <Button
            variant="ghost"
            disabled={locked || question.options.length >= MAX_ANSWERS}
            onClick={() => edit((k) => addAnswer(k))}
          >
            + Add answer
          </Button>
        </fieldset>
        <Input
          label="Topic"
          hint="One word or phrase, for example git. Separate several with commas."
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Textarea
          label="Explanation"
          hint={`Shown to ${t.learners} after they answer. Required.`}
          rows={3}
          value={question.explanation}
          error={problems.explanation}
          onChange={(e) =>
            edit((k) => ({ ...k, question: { ...k.question, explanation: e.target.value } }))
          }
        />
      </div>
    </Dialog>
  );
}

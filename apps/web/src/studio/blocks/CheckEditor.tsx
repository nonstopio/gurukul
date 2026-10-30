import { Button, Input, PlusIcon, Radio, Textarea } from '@gurukul/ui';
import {
  MAX_CHECK_OPTIONS,
  MIN_CHECK_OPTIONS,
  addCheckOption,
  removeCheckOption,
  setCheckCorrect,
  setCheckOption,
} from '../lessonEdit';
import { useTerms } from '../../labels/useTerms';
import type { BlockEditorProps } from './types';

/** An ungraded "check yourself" question: the prompt, two to six answers with the right one marked, and the explanation shown afterwards. */
export function CheckEditor({ block, onChange }: BlockEditorProps<'check'>) {
  const t = useTerms();
  return (
    <div className="studio-fields">
      <Textarea
        label="Question"
        rows={2}
        value={block.prompt}
        onChange={(e) => onChange({ ...block, prompt: e.target.value })}
      />
      <fieldset className="studio-answers">
        <legend className="studio-legend">Answers</legend>
        {block.options.map((option, i) => (
          <div
            className={`studio-answer${block.correct === i ? ' studio-answer--correct' : ''}`}
            key={i}
          >
            <Radio
              name={`correct-${block.id}`}
              aria-label={`Answer ${i + 1} is correct`}
              checked={block.correct === i}
              onChange={() => onChange(setCheckCorrect(block, i))}
            />
            <Input
              label={`Answer ${i + 1}`}
              value={option}
              onChange={(e) => onChange(setCheckOption(block, i, e.target.value))}
            />
            <Button
              variant="ghost"
              aria-label={`Remove answer ${i + 1}`}
              disabled={block.options.length <= MIN_CHECK_OPTIONS}
              onClick={() => onChange(removeCheckOption(block, i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          icon={<PlusIcon />}
          disabled={block.options.length >= MAX_CHECK_OPTIONS}
          onClick={() => onChange(addCheckOption(block))}
        >
          Add answer
        </Button>
        <p className="studio-muted">
          A check is not graded. Choose the right answer: {t.learners} see it marked, with the
          explanation, when they reveal it.
        </p>
      </fieldset>
      <Textarea
        label="Explanation"
        rows={3}
        value={block.explanation}
        onChange={(e) => onChange({ ...block, explanation: e.target.value })}
      />
    </div>
  );
}

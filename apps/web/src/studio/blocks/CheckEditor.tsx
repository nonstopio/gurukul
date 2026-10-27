import { Button, Input, Textarea } from '@gurukul/ui';
import {
  MAX_CHECK_OPTIONS,
  MIN_CHECK_OPTIONS,
  addCheckOption,
  removeCheckOption,
  setCheckOption,
} from '../lessonEdit';
import type { BlockEditorProps } from './types';

/** An ungraded "check yourself" question: the prompt, two to six answers, and the explanation shown afterwards. */
export function CheckEditor({ block, onChange }: BlockEditorProps<'check'>) {
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
          <div className="studio-answer" key={i}>
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
          disabled={block.options.length >= MAX_CHECK_OPTIONS}
          onClick={() => onChange(addCheckOption(block))}
        >
          + Add answer
        </Button>
        <p className="studio-muted">
          A check is not graded, so no answer is marked. Learners reveal the explanation.
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

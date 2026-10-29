import type { Question } from '@gurukul/schema';
import { QuizOption } from '@gurukul/ui';
import type { QuizOptionState } from '@gurukul/ui';
import { Prose } from '../player/blocks';
import { letterOf } from './model';

/**
 * One question as a learner answers it: prompt, code, lettered options. The learner's Pariksha and
 * Vyasa Studio's preview both render it, so the preview cannot drift from the real screen.
 */
export function QuestionFields({
  question,
  picked,
  stateOf,
  onPick,
  busy = false,
}: {
  question: Question;
  picked: readonly string[];
  stateOf: (optionId: string) => QuizOptionState;
  onPick: (optionId: string, on: boolean) => void;
  busy?: boolean;
}) {
  return (
    <fieldset className="exam__question" disabled={busy} aria-busy={busy}>
      <legend className="exam__prompt">
        <Prose md={question.prompt} />
      </legend>
      {question.code ? (
        <pre className="exam__code">
          <code>{question.code}</code>
        </pre>
      ) : null}
      {question.options.map((o, i) => (
        <QuizOption
          key={o.id}
          name={question.id}
          value={o.id}
          letter={letterOf(i)}
          multiple={question.kind === 'multiple'}
          checked={picked.includes(o.id)}
          state={stateOf(o.id)}
          onChange={(on) => onPick(o.id, on)}
        >
          {o.text}
        </QuizOption>
      ))}
    </fieldset>
  );
}

import type { Pariksha } from '@gurukul/schema';
import { Callout, Input, Select, Toggle } from '@gurukul/ui';
import { parseCooldown, parsePassMark, parseShown, passMarkText } from '../questionEdit';
import { patch } from '../patch';

const REVEAL: Array<{ value: Pariksha['revealAnswers']; label: string }> = [
  { value: 'each', label: 'After each question' },
  { value: 'onPass', label: 'Only after passing' },
  { value: 'never', label: 'Never' },
];

/** Pass mark, how many questions are drawn, cooldown, shuffling and when answers are revealed. */
export function ParikshaSettings({
  pariksha,
  coursePassPercent,
  onChange,
}: {
  pariksha: Pariksha;
  /** The course's pass mark as a percentage, shown as the placeholder when this Pariksha has none. */
  coursePassPercent: number;
  onChange: (edit: (p: Pariksha) => Pariksha) => void;
}) {
  return (
    <div className="studio-fields">
      <Input
        label="Pariksha title"
        value={pariksha.title}
        onChange={(e) => onChange((p) => ({ ...p, title: e.target.value }))}
      />
      <Input
        label="Pass mark (%)"
        hint="Leave empty to use the course's pass mark."
        type="number"
        min={0}
        max={100}
        placeholder={String(coursePassPercent)}
        value={passMarkText(pariksha.passMark)}
        onChange={(e) => onChange((p) => patch(p, { passMark: parsePassMark(e.target.value) }))}
      />
      <Input
        label="Questions shown"
        hint={`Drawn at random from the ${pariksha.questions.length} below.`}
        type="number"
        min={1}
        max={Math.max(pariksha.questions.length, 1)}
        value={pariksha.questionsShown}
        onChange={(e) =>
          onChange((p) => ({
            ...p,
            questionsShown: parseShown(e.target.value, p.questions.length),
          }))
        }
      />
      <Input
        label="Cooldown between attempts (minutes)"
        type="number"
        min={0}
        value={pariksha.cooldownMinutes}
        onChange={(e) =>
          onChange((p) => ({ ...p, cooldownMinutes: parseCooldown(e.target.value) }))
        }
      />
      <Toggle
        label="Shuffle answer order"
        checked={pariksha.shuffleOptions}
        onChange={(e) => onChange((p) => ({ ...p, shuffleOptions: e.target.checked }))}
      />
      <Toggle
        label="Learners must pass to open the next parva"
        checked={pariksha.blocksNext}
        onChange={(e) => onChange((p) => ({ ...p, blocksNext: e.target.checked }))}
      />
      <Select
        label="Reveal answers"
        value={pariksha.revealAnswers}
        onChange={(e) =>
          onChange((p) => ({ ...p, revealAnswers: e.target.value as Pariksha['revealAnswers'] }))
        }
      >
        {REVEAL.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Callout tone="note" title="Answers stay on the server">
        Answers are graded on the server and stored apart from the course, so learners never receive
        them in their browser.
      </Callout>
    </div>
  );
}

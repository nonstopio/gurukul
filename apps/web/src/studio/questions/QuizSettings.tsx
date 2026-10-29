import type { Quiz } from '@gurukul/schema';
import { Callout, Input, Select, Toggle } from '@gurukul/ui';
import { parseCooldown, parsePassMark, parseShown, passMarkText } from '../questionEdit';
import { patch } from '../patch';
import { useTerms } from '../../labels/useTerms';

const REVEAL: Array<{ value: Quiz['revealAnswers']; label: string }> = [
  { value: 'each', label: 'After each question' },
  { value: 'onPass', label: 'Only after passing' },
  { value: 'never', label: 'Never' },
];

/** Pass mark, how many questions are drawn, cooldown, shuffling and when answers are revealed. */
export function QuizSettings({
  quiz,
  coursePassPercent,
  onChange,
}: {
  quiz: Quiz;
  /** The course's pass mark as a percentage, shown as the placeholder when this Quiz has none. */
  coursePassPercent: number;
  onChange: (edit: (p: Quiz) => Quiz) => void;
}) {
  const t = useTerms();
  return (
    <div className="studio-fields">
      <Input
        label={`${t.Quiz} title`}
        value={quiz.title}
        onChange={(e) => onChange((p) => ({ ...p, title: e.target.value }))}
      />
      <Input
        label="Pass mark (%)"
        hint="Leave empty to use the course's pass mark."
        type="number"
        min={0}
        max={100}
        placeholder={String(coursePassPercent)}
        value={passMarkText(quiz.passMark)}
        onChange={(e) => onChange((p) => patch(p, { passMark: parsePassMark(e.target.value) }))}
      />
      <Input
        label="Questions shown"
        hint={`Drawn at random from the ${quiz.questions.length} below.`}
        type="number"
        min={1}
        max={Math.max(quiz.questions.length, 1)}
        value={quiz.questionsShown}
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
        value={quiz.cooldownMinutes}
        onChange={(e) =>
          onChange((p) => ({ ...p, cooldownMinutes: parseCooldown(e.target.value) }))
        }
      />
      <Toggle
        label="Shuffle answer order"
        checked={quiz.shuffleOptions}
        onChange={(e) => onChange((p) => ({ ...p, shuffleOptions: e.target.checked }))}
      />
      <Toggle
        label={`${t.Learners} must pass to open the next ${t.chapter}`}
        checked={quiz.blocksNext}
        onChange={(e) => onChange((p) => ({ ...p, blocksNext: e.target.checked }))}
      />
      <Select
        label="Reveal answers"
        value={quiz.revealAnswers}
        onChange={(e) =>
          onChange((p) => ({ ...p, revealAnswers: e.target.value as Quiz['revealAnswers'] }))
        }
      >
        {REVEAL.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Callout tone="note" title="Answers stay on the server">
        {`Answers are graded on the server and stored apart from the course, so ${t.learners} never receive them in their browser.`}
      </Callout>
    </div>
  );
}

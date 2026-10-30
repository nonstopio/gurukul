import { Checkbox, Radio } from '@gurukul/ui';

/** The tick or dot that marks an answer correct: a checkbox when several can be, a radio when one. */
export function AnswerMark({
  multiple,
  name,
  label,
  checked,
  onChange,
}: {
  multiple: boolean;
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return multiple ? (
    <Checkbox aria-label={label} checked={checked} onChange={onChange} />
  ) : (
    <Radio name={name} aria-label={label} checked={checked} onChange={onChange} />
  );
}

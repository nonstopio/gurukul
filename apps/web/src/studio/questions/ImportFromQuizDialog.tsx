import { Button, Dialog, EmptyState, Input, Select } from '@gurukul/ui';
import { useState } from 'react';
import { useTerms } from '../../labels/useTerms';
import { KIND_LABELS, parseTags } from '../questionEdit';
import type { Keyed, QuizSource } from '../questionEdit';

/**
 * Copies questions from a Quiz in one of the person's own courses into the bank, with their correct
 * answers. Questions already in the bank (same text) are shown but cannot be picked again.
 */
export function ImportFromQuizDialog({
  sources,
  bankPrompts,
  onClose,
  onImport,
}: {
  sources: QuizSource[];
  /** Lower-cased prompts already in the bank. */
  bankPrompts: ReadonlySet<string>;
  onClose: () => void;
  onImport: (entries: Keyed[], tags: string[]) => Promise<void>;
}) {
  const t = useTerms();
  const [quizId, setQuizId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const source = sources.find((s) => s.id === quizId);
  const inBank = (k: Keyed) => bankPrompts.has(k.question.prompt.trim().toLowerCase());
  const chosen = (source?.questions ?? []).filter((k) => picked.includes(k.question.id));

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const add = async () => {
    setSaving(true);
    try {
      await onImport(chosen, parseTags(tags));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      title={`Import from a ${t.Quiz}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={chosen.length === 0} onClick={() => void add()}>
            {`Add ${chosen.length} to the bank`}
          </Button>
        </>
      }
    >
      {sources.length === 0 ? (
        <EmptyState headingAs="h3" title={`No ${t.Quiz} to import from`}>
          {`Questions come from the ${t.Quizzes} in courses you edit. Add a question to a ${t.Quiz} first, or write a new one here.`}
        </EmptyState>
      ) : (
        <div className="studio-question">
          <Select
            label={t.Quiz}
            value={quizId}
            onChange={(e) => {
              setQuizId(e.target.value);
              setPicked([]);
            }}
          >
            <option value="">{`Choose a ${t.Quiz}`}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          {source ? (
            <>
              {source.questions.length === 0 ? (
                <p className="sc-help">This {t.Quiz} has no question with a marked answer yet.</p>
              ) : (
                <ul className="sc-rows" aria-label="Questions to import">
                  {source.questions.map((k) => (
                    <li key={k.question.id} className="sc-row">
                      <label className="sc-bank__pick">
                        <input
                          type="checkbox"
                          checked={picked.includes(k.question.id)}
                          disabled={inBank(k)}
                          onChange={() => toggle(k.question.id)}
                        />
                        <span>
                          {k.question.prompt}
                          <span className="sc-help">
                            {' '}
                            {KIND_LABELS[k.question.kind]}
                            {inBank(k) ? ' · already in the bank' : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <Input
                label="Topic for these questions"
                hint="Optional. One word or phrase, for example git."
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

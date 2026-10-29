import { Dialog } from '@gurukul/ui';
import { useEffect, useState } from 'react';
import { isTyping } from './keys';

const GROUPS: { heading: string; rows: { keys: string[]; does: string }[] }[] = [
  {
    heading: 'Anywhere',
    rows: [
      { keys: ['?'], does: 'Show this list' },
      { keys: ['Ctrl K', '⌘K'], does: 'Search pages and courses' },
    ],
  },
  {
    heading: 'In a lesson',
    rows: [
      { keys: ['J'], does: 'Next item' },
      { keys: ['K'], does: 'Previous item' },
    ],
  },
  {
    heading: 'In a Pariksha',
    rows: [
      { keys: ['1', '2', '3', '4'], does: 'Choose that option' },
      { keys: ['A', 'B', 'C', 'D'], does: 'Choose that option' },
      { keys: ['Enter'], does: 'Check, go to the next question, or finish' },
    ],
  },
];

/** `?` opens the list of keyboard shortcuts; Escape closes it. Mounted once, in the signed-in frame. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      {GROUPS.map((g) => (
        <section key={g.heading} className="shortcuts__group">
          <h3 className="shortcuts__heading">{g.heading}</h3>
          <dl className="shortcuts__list">
            {g.rows.map((r) => (
              <div key={r.keys.join()} className="shortcuts__row">
                <dt>
                  {r.keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 ? <span className="shortcuts__or"> or </span> : null}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </dt>
                <dd>{r.does}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </Dialog>
  );
}

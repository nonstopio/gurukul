import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './tabs.css';

export interface TabItem {
  /** Stable id, used for `value`. */
  id: string;
  label: string;
  /** Content of the panel shown when this tab is selected. */
  panel: ReactNode;
}

export interface TabsProps {
  tabs: [TabItem, ...TabItem[]];
  /** Accessible name of the tab list. */
  label: string;
  /** Selected tab id when controlled. */
  value?: string;
  /** Initially selected tab id when uncontrolled. Default: the first tab. */
  defaultValue?: string;
  /** Called with the new tab id whenever the selection changes. */
  onValueChange?: (id: string) => void;
}

/**
 * Tabs with automatic activation. One tab stop (roving tabindex): Left and Right move and wrap,
 * Home and End jump to the ends. Needs at least one tab.
 */
export function Tabs({ tabs, label, value, defaultValue, onValueChange }: TabsProps) {
  const uid = useId();
  const [inner, setInner] = useState(defaultValue ?? tabs[0].id);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (tab: TabItem, index: number) => {
    setInner(tab.id);
    onValueChange?.(tab.id);
    refs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    refs.current[target]?.click();
  };

  return (
    <div className="g-tabs">
      <div className="g-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => {
          const selected = tab.id === current;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              className="g-tabs__tab"
              id={`${uid}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab, i)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="g-tabs__panel"
          role="tabpanel"
          id={`${uid}-panel-${tab.id}`}
          aria-labelledby={`${uid}-tab-${tab.id}`}
          hidden={tab.id !== current}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

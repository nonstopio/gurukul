// A select-only combobox (WAI-ARIA APG). The control is a focusable `role="combobox"` that shows
// the chosen option; its `role="listbox"` popup is drawn by us, not by the operating system. Focus
// never leaves the control: the active option is named by `aria-activedescendant`. The popup is
// `position: fixed` against the control, so a dialog's scrolling body cannot clip it, and it opens
// above the control when there is no room below.

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, KeyboardEvent, OptionHTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';
import { Field } from './Field';
import type { FieldProps } from './Field';
import { CheckIcon, ChevronDownIcon } from './Icon';
import './select.css';

/** What `onChange` receives: the shape of a native change event, so `e.target.value` keeps working. */
export interface SelectChangeEvent {
  target: { value: string };
}

export interface SelectProps extends Pick<
  FieldProps,
  'label' | 'hideLabel' | 'hint' | 'error' | 'id' | 'className'
> {
  /** The chosen value (controlled). */
  value?: string | undefined;
  /** The first value when uncontrolled. Default: the first option. */
  defaultValue?: string | undefined;
  /** Called when a different option is chosen. */
  onChange?: ((event: SelectChangeEvent) => void) | undefined;
  disabled?: boolean | undefined;
  /** `<option value>` elements; an option without `value` uses its text. */
  children?: ReactNode;
}

interface Option {
  value: string;
  label: string;
}

const PAGE = 10;
const TYPEAHEAD_MS = 500;
/** Below this many pixels of room under the control, the popup opens above if there is more room there. */
const ROOM = 240;
const GAP = 4;

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((el) => {
      const props = el.props as OptionHTMLAttributes<HTMLOptionElement>;
      const label = Children.toArray(props.children).join('');
      return { value: props.value === undefined ? label : String(props.value), label };
    });
}

interface Place {
  up: boolean;
  style: CSSProperties;
}

export function Select({
  label,
  hideLabel,
  hint,
  error,
  id,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  children,
}: SelectProps) {
  const options = readOptions(children);
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<Place>({ up: false, style: {} });
  const boxRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-option-${i}`;
  const last = options.length - 1;

  const show = (i: number) => {
    setActive(Math.min(Math.max(i, 0), last));
    setOpen(true);
  };

  const commit = (i: number) => {
    setOpen(false);
    const next = (options[i] as Option).value;
    if (next === options[selected]?.value) return;
    setInner(next);
    onChange?.({ target: { value: next } });
  };

  // Typed letters within half a second build one search; it starts after the active option for a
  // single letter (so repeating a letter cycles) and at it for a longer prefix.
  const match = (key: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at < TYPEAHEAD_MS ? t.text + key.toLowerCase() : key.toLowerCase();
    t.at = now;
    const start = t.text.length > 1 ? from : from + 1;
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if ((options[i] as Option).label.toLowerCase().startsWith(t.text)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !options.length) return;
    // A space typed while a search is under way is part of it ("Certificate revoked"), not a
    // choice (APG select-only combobox).
    const searching =
      e.key === ' ' && typed.current.text !== '' && Date.now() - typed.current.at < TYPEAHEAD_MS;
    if (searching) e.preventDefault();
    else if (!open) {
      const at: Record<string, number> = {
        ArrowDown: selected,
        ArrowUp: selected,
        Enter: selected,
        ' ': selected,
        Home: 0,
        End: last,
      };
      if (e.key in at) {
        e.preventDefault();
        show(at[e.key] as number);
        return;
      }
    } else {
      const move: Record<string, number> = {
        ArrowDown: active + 1,
        ArrowUp: active - 1,
        Home: 0,
        End: last,
        PageDown: active + PAGE,
        PageUp: active - PAGE,
      };
      if (e.key in move) {
        e.preventDefault();
        show(move[e.key] as number);
        return;
      }
      switch (e.key) {
        case 'Enter':
        case ' ':
          e.preventDefault();
          return commit(active);
        case 'Escape':
          // Stops here, so a dialog holding the select stays open.
          e.preventDefault();
          e.stopPropagation();
          return setOpen(false);
        case 'Tab':
          // Chooses the active option; focus moves on as usual.
          return commit(active);
      }
    }
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey) return;
    const found = match(e.key, open ? active : selected);
    if (found >= 0) show(found);
  };

  // Place the popup against the control, and keep it there while anything scrolls or resizes.
  useLayoutEffect(() => {
    if (!open) return;
    const fit = () => {
      const r = (boxRef.current as HTMLElement).getBoundingClientRect();
      const below = window.innerHeight - r.bottom;
      const up = below < ROOM && r.top > below;
      setPlace({
        up,
        style: {
          left: r.left,
          width: r.width,
          ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
          ['--select-room' as string]: `${(up ? r.top : below) - GAP * 4}px`,
        },
      });
    };
    fit();
    window.addEventListener('scroll', fit, true);
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('scroll', fit, true);
      window.removeEventListener('resize', fit);
    };
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  return (
    <Field
      label={label}
      hideLabel={hideLabel}
      hint={hint}
      error={error}
      id={id}
      className={className}
      // A label names only native controls, so a click on it would do nothing: focus the
      // combobox, as a native select's label does, without opening it.
      onLabelClick={() => {
        if (!disabled) boxRef.current?.focus();
      }}
    >
      {(control) => (
        <div className="g-select">
          <div
            ref={boxRef}
            {...control}
            role="combobox"
            className="g-control g-control--select"
            tabIndex={disabled ? -1 : 0}
            aria-labelledby={`${control.id}-label`}
            aria-disabled={disabled || undefined}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={open ? optionId(active) : undefined}
            onClick={() => {
              if (disabled) return;
              if (open) setOpen(false);
              else show(selected);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setOpen(false)}
          >
            <span className="g-select__value">{options[selected]?.label}</span>
            <ChevronDownIcon className="g-select__chevron" />
          </div>
          {open ? (
            <div
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={`${control.id}-label`}
              className={cx('g-select__list', place.up && 'g-select__list--up')}
              style={place.style}
              // The control keeps focus (and so the keyboard) while the list is clicked or scrolled.
              onMouseDown={(e) => e.preventDefault()}
            >
              {options.map((o, i) => (
                // Keyboard is handled by the combobox through aria-activedescendant.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <div
                  key={`${i}-${o.value}`}
                  id={optionId(i)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === selected}
                  className={cx('g-select__option', i === active && 'g-select__option--active')}
                  onMouseMove={() => setActive(i)}
                  onClick={() => commit(i)}
                >
                  <span className="g-select__label">{o.label}</span>
                  {i === selected ? <CheckIcon className="g-select__check" /> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

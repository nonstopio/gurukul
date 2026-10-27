import { useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { cx } from './cx';
import './drag-list.css';

/** Pixels the pointer must travel before a press on the grip becomes a drag. */
const DRAG_THRESHOLD = 4;

/** A copy of `list` with the item at `from` moved to `to`. `to` is clamped; the input is never changed. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(to, 0), next.length - 1);
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item as T);
  return next;
}

export interface DragListProps<T> {
  items: T[];
  /** A stable key per item (an id), so a row keeps its identity, and the grip its focus, when it moves. */
  itemKey: (item: T) => string;
  /** Renders one row's content. Place `handle` yourself; `dragging` is true while the row is lifted or dragged. */
  renderItem: (item: T, ctx: { index: number; handle: ReactNode; dragging: boolean }) => ReactNode;
  /**
   * Called with the item's old and new index. From the keyboard it fires on every arrow press (the
   * caller reorders live, and Escape calls it once more to restore the start position). From a
   * pointer it fires once, on drop.
   */
  onMove: (from: number, to: number) => void;
  /** Accessible name of the list. */
  label: string;
  /** Names an item in the grip's accessible name ("Move {label}") and in announcements. */
  itemLabel: (item: T) => string;
  className?: string;
}

interface PointerState {
  index: number;
  startY: number;
  active: boolean;
  gap: number;
}

function Grip() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
      {[5, 11].flatMap((x) =>
        [3.5, 8, 12.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.25" />),
      )}
    </svg>
  );
}

/**
 * A reorderable list. Every row has a real grip button: focus it, Space or Enter lifts the row,
 * the arrow keys move it (clamped), Space or Enter drops it, Escape puts it back. Alt+Arrow on the
 * grip moves one place without lifting. A pointer drags the grip after 4px of travel. Moves are
 * announced in a `role="status"` region.
 */
export function DragList<T>({
  items,
  itemKey,
  renderItem,
  onMove,
  label,
  itemLabel,
  className,
}: DragListProps<T>) {
  const [lift, setLift] = useState<{ key: string; origin: number } | null>(null);
  const [drag, setDrag] = useState<{ key: string; gap: number | null } | null>(null);
  const [message, setMessage] = useState('');
  const pointer = useRef<PointerState | null>(null);
  const total = items.length;

  const place = (verb: string, item: T, index: number) =>
    `${verb} ${itemLabel(item)} ${verb === 'Picked up' ? 'from' : 'to'} position ${index + 1} of ${total}`;

  const step = (index: number, delta: number) => {
    const to = Math.min(Math.max(index + delta, 0), total - 1);
    if (to === index) return;
    onMove(index, to);
    setMessage(place('Moved', items[index] as T, to));
  };

  const toggleLift = (item: T, index: number, lifted: boolean) => {
    if (lifted) {
      setLift(null);
      setMessage(`Dropped ${itemLabel(item)} at position ${index + 1} of ${total}`);
    } else {
      setLift({ key: itemKey(item), origin: index });
      setMessage(
        `${place('Picked up', item, index)}. Arrow keys move it, Space drops it, Escape cancels.`,
      );
    }
  };

  const cancel = (index: number, lifted: boolean): boolean => {
    if (pointer.current) {
      pointer.current = null;
      setDrag(null);
      setMessage('Cancelled');
      return true;
    }
    if (!lift || !lifted) return false;
    if (index !== lift.origin) onMove(index, lift.origin);
    setLift(null);
    setMessage('Cancelled');
    return true;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, item: T, index: number) => {
    const lifted = lift?.key === itemKey(item);
    const vertical = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (vertical && (e.altKey || lifted)) {
      e.preventDefault();
      step(index, e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleLift(item, index, lifted);
    } else if (e.key === 'Escape' && cancel(index, lifted)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const gapAt = (list: Element, y: number): number => {
    let gap = 0;
    Array.from(list.children).forEach((row, i) => {
      const box = row.getBoundingClientRect();
      if (y > box.top + box.height / 2) gap = i + 1;
    });
    return gap;
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.button !== 0) return;
    pointer.current = { index, startY: e.clientY, active: false, gap: index };
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>, key: string) => {
    const p = pointer.current;
    if (!p) return;
    if (!p.active && Math.abs(e.clientY - p.startY) < DRAG_THRESHOLD) return;
    p.active = true;
    p.gap = gapAt(e.currentTarget.closest('ol') as HTMLOListElement, e.clientY);
    setDrag({ key, gap: p.gap === p.index || p.gap === p.index + 1 ? null : p.gap });
  };

  const onPointerUp = (item: T) => {
    const p = pointer.current;
    pointer.current = null;
    if (!p?.active) return;
    setDrag(null);
    const to = p.gap > p.index ? p.gap - 1 : p.gap;
    if (to === p.index) return;
    onMove(p.index, to);
    setMessage(place('Moved', item, to));
  };

  const onPointerCancel = () => {
    const wasDragging = pointer.current?.active;
    pointer.current = null;
    if (!wasDragging) return;
    setDrag(null);
    setMessage('Cancelled');
  };

  return (
    <>
      <ol className={cx('g-draglist', className)} aria-label={label}>
        {items.map((item, index) => {
          const key = itemKey(item);
          const lifted = lift?.key === key;
          const dragging = lifted || drag?.key === key;
          const drop =
            drag?.gap === index
              ? 'before'
              : drag?.gap === total && index === total - 1
                ? 'after'
                : undefined;
          const handle = (
            <button
              type="button"
              className="g-draglist__grip"
              aria-label={`Move ${itemLabel(item)}`}
              aria-pressed={lifted}
              onKeyDown={(e) => onKeyDown(e, item, index)}
              onKeyUp={(e) => {
                if (e.key === ' ') e.preventDefault();
              }}
              onClick={(e) => {
                if (e.detail === 0) toggleLift(item, index, lifted);
              }}
              onBlur={() => {
                if (lifted) setLift(null);
              }}
              onPointerDown={(e) => onPointerDown(e, index)}
              onPointerMove={(e) => onPointerMove(e, key)}
              onPointerUp={() => onPointerUp(item)}
              onPointerCancel={onPointerCancel}
            >
              <Grip />
            </button>
          );
          return (
            <li
              key={key}
              className="g-draglist__row"
              data-dragging={dragging || undefined}
              data-drop={drop}
            >
              {renderItem(item, { index, handle, dragging })}
            </li>
          );
        })}
      </ol>
      <p className="g-draglist__sr" role="status" aria-live="polite">
        {message}
      </p>
    </>
  );
}

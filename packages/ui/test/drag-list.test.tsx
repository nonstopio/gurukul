import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DragList, moveItem } from '../src';
import { axeViolations } from './axe';

interface Row {
  id: string;
  name: string;
}
const ROWS: Row[] = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Gamma' },
];

function Harness({ onMove }: { onMove?: (from: number, to: number) => void }) {
  const [items, setItems] = useState(ROWS);
  return (
    <DragList
      items={items}
      itemKey={(r) => r.id}
      itemLabel={(r) => r.name}
      label="Lessons"
      onMove={(from, to) => {
        onMove?.(from, to);
        setItems((list) => moveItem(list, from, to));
      }}
      renderItem={(r, { handle, dragging, index }) => (
        <div data-testid={`row-${r.id}`} data-dragging={dragging} data-index={index}>
          {handle}
          <span>{r.name}</span>
        </div>
      )}
    />
  );
}

const names = () => screen.getAllByRole('listitem').map((li) => li.textContent);
const grip = (name: string) => screen.getByRole('button', { name: `Move ${name}` });
const status = () => screen.getByRole('status').textContent;

class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent);
});

describe('moveItem', () => {
  it('moves forward and back without changing the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    expect(moveItem(input, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(input, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(input).toEqual(['a', 'b', 'c', 'd']);
  });
  it('clamps the target and ignores a bad source', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -4)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], -1, 0)).toEqual(['a', 'b']);
  });
});

describe('DragList structure', () => {
  it('renders a named ordered list with a labelled grip per row', () => {
    render(<Harness />);
    expect(screen.getByRole('list', { name: 'Lessons' }).tagName).toBe('OL');
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(grip('Beta').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('row-b').dataset.index).toBe('1');
  });
  it('has no axe violations, idle or lifted', async () => {
    const { container } = render(<Harness />);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('DragList keyboard', () => {
  it('lifts with Space, moves live with arrows, drops with Space', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    expect(status()).toBe(
      'Picked up Alpha from position 1 of 3. Arrow keys move it, Space drops it, Escape cancels.',
    );
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('row-a').dataset.dragging).toBe('true');
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    expect(onMove).toHaveBeenLastCalledWith(0, 1);
    expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(status()).toBe('Moved Alpha to position 2 of 3');
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowUp' });
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
    fireEvent.keyDown(grip('Alpha'), { key: 'Enter' });
    expect(status()).toBe('Dropped Alpha at position 1 of 3');
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('false');
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it('clamps at both ends without calling onMove', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    fireEvent.keyDown(grip('Alpha'), { key: 'Enter' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowUp' });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(names()).toEqual(['Beta', 'Gamma', 'Alpha']);
  });

  it('Escape restores the original position and announces it', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    fireEvent.keyDown(grip('Alpha'), { key: 'Escape' });
    expect(onMove).toHaveBeenLastCalledWith(2, 0);
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(status()).toBe('Cancelled');
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('false');
  });

  it('Escape without a move just drops the lift, and does nothing when idle', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    const idle = fireEvent.keyDown(grip('Alpha'), { key: 'Escape' });
    expect(idle).toBe(true);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    fireEvent.keyDown(grip('Alpha'), { key: 'Escape' });
    expect(onMove).not.toHaveBeenCalled();
    expect(status()).toBe('Cancelled');
  });

  it('Escape on another row leaves the lift alone', () => {
    render(<Harness />);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    fireEvent.keyDown(grip('Beta'), { key: 'Escape' });
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('true');
  });

  it('Alt+Arrow moves one place without lifting', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    fireEvent.keyDown(grip('Beta'), { key: 'ArrowUp', altKey: true });
    expect(onMove).toHaveBeenCalledWith(1, 0);
    expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(status()).toBe('Moved Beta to position 1 of 3');
    fireEvent.keyDown(grip('Beta'), { key: 'ArrowDown', altKey: true });
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(grip('Beta').getAttribute('aria-pressed')).toBe('false');
  });

  it('plain arrows on an idle grip do nothing', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    expect(fireEvent.keyDown(grip('Beta'), { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(grip('Beta'), { key: 'a' })).toBe(true);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('keeps focus on the grip while the row moves', () => {
    render(<Harness />);
    grip('Alpha').focus();
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    fireEvent.keyDown(grip('Alpha'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(grip('Alpha'));
  });

  it('drops the lift on blur', () => {
    render(<Harness />);
    fireEvent.keyDown(grip('Alpha'), { key: ' ' });
    fireEvent.blur(grip('Alpha'));
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('false');
    fireEvent.blur(grip('Alpha'));
  });

  it('a click with no pointer (assistive tech) lifts and drops; a pointer click is ignored', () => {
    render(<Harness />);
    fireEvent.click(grip('Alpha'));
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(grip('Alpha'));
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(grip('Alpha'), { detail: 1 });
    expect(grip('Alpha').getAttribute('aria-pressed')).toBe('false');
  });

  it('swallows the Space key-up so a button does not click again', () => {
    render(<Harness />);
    expect(fireEvent.keyUp(grip('Alpha'), { key: ' ' })).toBe(false);
    expect(fireEvent.keyUp(grip('Alpha'), { key: 'a' })).toBe(true);
  });
});

describe('DragList pointer', () => {
  function layout() {
    screen.getAllByRole('listitem').forEach((li, i) => {
      li.getBoundingClientRect = () => new DOMRect(0, i * 50, 300, 40);
    });
  }
  const drop = (name: string) => screen.getByText(name).closest('li')?.dataset.drop;

  it('drags past the threshold, shows the indicator and calls onMove once on drop', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Alpha');
    fireEvent.pointerDown(g, { button: 0, clientY: 20 });
    fireEvent.pointerMove(g, { clientY: 140 });
    expect(drop('Gamma')).toBe('after');
    expect(screen.getByTestId('row-a').dataset.dragging).toBe('true');
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.pointerMove(g, { clientY: 100 });
    expect(drop('Beta')).toBeUndefined();
    expect(drop('Gamma')).toBe('before');
    fireEvent.pointerUp(g);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(0, 1);
    expect(names()).toEqual(['Beta', 'Alpha', 'Gamma']);
    expect(status()).toBe('Moved Alpha to position 2 of 3');
    expect(drop('Gamma')).toBeUndefined();
  });

  it('drags upward to the first slot', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Gamma');
    fireEvent.pointerDown(g, { button: 0, clientY: 120 });
    fireEvent.pointerMove(g, { clientY: 5 });
    expect(drop('Alpha')).toBe('before');
    fireEvent.pointerUp(g);
    expect(onMove).toHaveBeenCalledWith(2, 0);
  });

  it('under the threshold is not a drag', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Alpha');
    fireEvent.pointerDown(g, { button: 0, clientY: 20 });
    fireEvent.pointerMove(g, { clientY: 23 });
    expect(screen.getByTestId('row-a').dataset.dragging).toBe('false');
    fireEvent.pointerUp(g);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('dropping where it started calls nothing', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Beta');
    fireEvent.pointerDown(g, { button: 0, clientY: 70 });
    fireEvent.pointerMove(g, { clientY: 80 });
    fireEvent.pointerUp(g);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('pointercancel abandons the drag', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Alpha');
    fireEvent.pointerDown(g, { button: 0, clientY: 20 });
    fireEvent.pointerMove(g, { clientY: 140 });
    fireEvent.pointerCancel(g);
    expect(status()).toBe('Cancelled');
    expect(drop('Gamma')).toBeUndefined();
    fireEvent.pointerUp(g);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('pointercancel before the threshold is silent', () => {
    render(<Harness />);
    const g = grip('Alpha');
    fireEvent.pointerDown(g, { button: 0, clientY: 20 });
    fireEvent.pointerCancel(g);
    expect(status()).toBe('');
    fireEvent.pointerCancel(g);
  });

  it('Escape cancels a pointer drag', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Alpha');
    fireEvent.pointerDown(g, { button: 0, clientY: 20 });
    fireEvent.pointerMove(g, { clientY: 140 });
    fireEvent.keyDown(g, { key: 'Escape' });
    fireEvent.pointerUp(g);
    expect(status()).toBe('Cancelled');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('ignores other buttons and moves with no press', () => {
    const onMove = vi.fn();
    render(<Harness onMove={onMove} />);
    layout();
    const g = grip('Alpha');
    fireEvent.pointerMove(g, { clientY: 140 });
    fireEvent.pointerDown(g, { button: 2, clientY: 20 });
    fireEvent.pointerMove(g, { clientY: 140 });
    fireEvent.pointerUp(g);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('captures the pointer when the browser can', () => {
    render(<Harness />);
    const g = grip('Alpha');
    const capture = vi.fn();
    g.setPointerCapture = capture;
    act(() => {
      fireEvent.pointerDown(g, { button: 0, clientY: 20, pointerId: 7 });
    });
    expect(capture).toHaveBeenCalledWith(7);
  });
});

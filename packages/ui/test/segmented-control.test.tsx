import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from '../src/SegmentedControl';
import { axeViolations } from './axe';

type Tone = 'info' | 'warning' | 'success';
const options = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'success', label: 'Success' },
] as const;

function Harness({ onChange }: { onChange?: (v: Tone) => void }) {
  const [value, setValue] = useState<Tone>('info');
  return (
    <SegmentedControl
      label="Tone"
      value={value}
      options={options}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

const buttons = () => screen.getAllByRole('button') as [HTMLElement, HTMLElement, HTMLElement];

describe('SegmentedControl', () => {
  it('is a named group of buttons with the value pressed', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Tone' })).toBeTruthy();
    expect(buttons().map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(buttons().every((b) => b.getAttribute('type') === 'button')).toBe(true);
  });

  it('picks a value on click', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Warning' }));
    expect(onChange).toHaveBeenCalledWith('warning');
    expect(screen.getByRole('button', { name: 'Warning' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('moves focus with Left and Right, wrapping, without choosing', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const [a, b, c] = buttons();
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'ArrowRight' });
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(c);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('leaves other keys alone', () => {
    render(<Harness />);
    const [a] = buttons();
    a.focus();
    expect(fireEvent.keyDown(a, { key: 'ArrowDown' })).toBe(true);
    expect(document.activeElement).toBe(a);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Attachable } from '../src';
import { axeViolations } from './axe';

function Toggling({ onChange }: { onChange: (attached: boolean) => void }) {
  const [attached, setAttached] = useState(false);
  return (
    <Attachable
      label="Lesson 3.2 · Text block 2"
      attached={attached}
      onAttachedChange={(next) => {
        onChange(next);
        setAttached(next);
      }}
      className="x"
      id="block"
    >
      <p>Rebase before you open a pull request.</p>
      <button type="button">Copy</button>
    </Attachable>
  );
}

describe('Attachable', () => {
  it('attaches and removes with a named toggle button beside the content', async () => {
    const onChange = vi.fn();
    const { container } = render(<Toggling onChange={onChange} />);
    const wrap = container.querySelector('#block') as HTMLElement;
    expect(wrap.className).toBe('g-attachable x');
    const button = screen.getByRole('button', {
      name: 'Attach Lesson 3.2 · Text block 2 to your message',
    });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('data-tip')).toBe('Attach');
    expect(button.className).toContain('g-attachable__button');
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(button);
    expect(onChange).toHaveBeenLastCalledWith(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-tip')).toBe('Attached');
    expect(wrap.className).toBe('g-attachable g-attachable--attached x');
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(button);
    expect(onChange).toHaveBeenLastCalledWith(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('leaves the content’s own controls alone', () => {
    const onChange = vi.fn();
    render(<Toggling onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByText('Rebase before you open a pull request.'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, Radio } from '../src';
import { axeViolations } from './axe';

describe('Checkbox', () => {
  it('is a named checkbox that toggles and shows its label', async () => {
    const onChange = vi.fn();
    const { container } = render(<Checkbox label="Git" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Git' }) as HTMLInputElement;
    fireEvent.click(screen.getByText('Git'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(box.checked).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('can have no visible label when it has an aria-label, and be disabled', () => {
    const { container } = render(
      <Checkbox aria-label="Select row 3" className="x" checked disabled onChange={() => {}} />,
    );
    const box = screen.getByRole('checkbox', { name: 'Select row 3' }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(true);
    expect(container.querySelector('.g-check__label')).toBeNull();
    expect(container.firstElementChild?.className).toBe('g-check x');
  });

  it('says some, not all, with the indeterminate state and a dash, and clears it', () => {
    function Group({ some }: { some: boolean }) {
      return <Checkbox aria-label="All" indeterminate={some} checked={false} onChange={() => {}} />;
    }
    const { container, rerender } = render(<Group some />);
    const box = screen.getByRole('checkbox', { name: 'All' }) as HTMLInputElement;
    expect(box.indeterminate).toBe(true);
    expect(container.querySelector('.g-check__box path')?.getAttribute('d')).toBe('M4 8h8');
    rerender(<Group some={false} />);
    expect(box.indeterminate).toBe(false);
    expect(container.querySelector('.g-check__box path')?.getAttribute('d')).not.toBe('M4 8h8');
  });
});

describe('Radio', () => {
  function Pair() {
    const [v, setV] = useState('a');
    return (
      <>
        {['a', 'b'].map((x) => (
          <Radio
            key={x}
            name="pair"
            label={`Choice ${x}`}
            checked={v === x}
            onChange={() => setV(x)}
            className="r"
          />
        ))}
        <Radio name="pair2" aria-label="Alone" checked={false} onChange={() => {}} />
      </>
    );
  }

  it('picks one of many, with a drawn round box', async () => {
    const { container } = render(<Pair />);
    const [a, b] = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(a?.checked).toBe(true);
    fireEvent.click(screen.getByText('Choice b'));
    expect(b?.checked).toBe(true);
    expect(a?.checked).toBe(false);
    expect(container.querySelector('.g-check--radio.r')).toBeTruthy();
    expect(container.querySelectorAll('.g-check__label')).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
  });
});

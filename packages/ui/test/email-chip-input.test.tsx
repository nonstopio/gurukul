import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EmailChipInput, StepCard, Stepper, splitEmails, type EmailClassification } from '../src';
import { axeViolations } from './axe';

const classify = (email: string): EmailClassification => {
  if (email.startsWith('new')) return { status: 'new' };
  if (email.startsWith('old')) return { status: 'alreadyAssigned' };
  if (email.startsWith('bad')) return { status: 'rejected', reason: 'not a nonstopio.com address' };
  if (email.startsWith('nr')) return { status: 'rejected' };
  return { status: 'signedIn' };
};

function Harness({
  initial = [] as string[],
  onChange,
}: {
  initial?: string[];
  onChange?: (v: string[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <EmailChipInput
      label="Emails"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      classify={classify}
    />
  );
}
const input = () => screen.getByLabelText('Emails') as HTMLInputElement;
const chips = () => screen.getAllByRole('listitem').map((li) => li.textContent);

describe('splitEmails', () => {
  it('splits on commas, spaces, semicolons and newlines, lower-cases and drops empties', () => {
    expect(splitEmails(' A@x.com,b@x.com;\nC@x.com  d@x.com ,, ')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
    expect(splitEmails('')).toEqual([]);
  });
});

describe('EmailChipInput', () => {
  it('is a labelled text input with a placeholder and no chips at first', () => {
    render(<Harness />);
    expect(input().placeholder).toBe('name@nonstopio.com');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('adds a chip on Enter and ignores Enter on an empty input', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'Asha@nonstopio.com' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith(['asha@nonstopio.com']);
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('');
  });

  it('splits pasted text into chips and dedupes', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a@x.com']} onChange={onChange} />);
    fireEvent.paste(input(), {
      clipboardData: { getData: () => 'a@x.com, B@x.com;c@x.com\nb@x.com' },
    });
    expect(onChange).toHaveBeenLastCalledWith(['a@x.com', 'b@x.com', 'c@x.com']);
  });

  it('paste of only duplicates changes nothing', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a@x.com']} onChange={onChange} />);
    fireEvent.paste(input(), { clipboardData: { getData: () => 'a@x.com' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits completed emails when a separator is typed and keeps the tail', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(input(), { target: { value: 'a@x.com, b@x' } });
    expect(onChange).toHaveBeenLastCalledWith(['a@x.com']);
    expect(input().value).toBe('b@x');
    fireEvent.change(input(), { target: { value: 'b@x.com ' } });
    expect(onChange).toHaveBeenLastCalledWith(['a@x.com', 'b@x.com']);
    expect(input().value).toBe('');
  });

  it('commits what is typed on blur, and nothing when empty', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.blur(input());
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: 'z@x.com' } });
    fireEvent.blur(input());
    expect(onChange).toHaveBeenLastCalledWith(['z@x.com']);
  });

  it('Backspace on an empty input removes the last chip; with text or no chips it does nothing', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a@x.com', 'b@x.com']} onChange={onChange} />);
    fireEvent.change(input(), { target: { value: 'q' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input(), { target: { value: '' } });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(['a@x.com']);
    fireEvent.keyDown(input(), { key: 'Backspace' });
    fireEvent.keyDown(input(), { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(input(), { key: 'x' });
  });

  it('each chip has a remove button with an accessible name', () => {
    const onChange = vi.fn();
    render(<Harness initial={['a@x.com', 'b@x.com']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove a@x.com' }));
    expect(onChange).toHaveBeenLastCalledWith(['b@x.com']);
    expect(chips()).toEqual(['b@x.com· signed in']);
  });

  it('states every status in words', () => {
    render(<Harness initial={['asha@x.com', 'new@x.com', 'old@x.com', 'bad@y.com', 'nr@y.com']} />);
    const list = screen.getByRole('list', { name: 'Emails: added emails' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.className.replace('g-emails__chip ', ''))).toEqual([
      'g-emails__chip--signedIn',
      'g-emails__chip--new',
      'g-emails__chip--alreadyAssigned',
      'g-emails__chip--rejected',
      'g-emails__chip--rejected',
    ]);
    expect(chips()).toEqual([
      'asha@x.com· signed in',
      'new@x.com· new',
      'old@x.com· already assigned',
      'bad@y.com· not a nonstopio.com address',
      'nr@y.com· rejected',
    ]);
  });

  it('supports a custom remove label, describedBy and placeholder', () => {
    render(
      <>
        <p id="legend">Legend</p>
        <EmailChipInput
          label="Emails"
          value={['a@x.com']}
          onChange={() => {}}
          classify={classify}
          describedBy="legend"
          placeholder="Paste"
          removeLabel={(e) => `Drop ${e}`}
        />
      </>,
    );
    expect(input().getAttribute('aria-describedby')).toBe('legend');
    expect(screen.getByRole('button', { name: 'Drop a@x.com' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness initial={['a@x.com', 'new@x.com', 'bad@y.com']} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('StepCard', () => {
  it('is a section named by its numbered heading', () => {
    const { container } = render(
      <StepCard number={2} title="People">
        <p>Body</p>
      </StepCard>,
    );
    const section = screen.getByRole('region', { name: 'Step 2: People' });
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Step 2: People');
    expect(container.querySelector('.g-step__badge')?.textContent).toBe('2');
    expect(within(section).getByText('Body')).toBeTruthy();
  });

  it('takes a heading level and is also available as Stepper.Step', async () => {
    const { container } = render(
      <Stepper.Step number={1} title="Courses" headingAs="h3">
        x
      </Stepper.Step>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});

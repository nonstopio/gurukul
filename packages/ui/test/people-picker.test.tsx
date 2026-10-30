import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, PeoplePicker, type Person } from '../src';
import { axeViolations } from './axe';

const PEOPLE: Person[] = [
  { email: 'asha@example.com', name: 'Asha Menon', role: 'Educator', tone: 'educator' },
  { email: 'arjun@example.com', name: 'Arjun Rao', role: 'Learner' },
  { email: 'meera@example.com' },
];

const find = (q: string) =>
  Promise.resolve(
    PEOPLE.filter((p) => `${p.name ?? ''} ${p.email}`.toLowerCase().includes(q.toLowerCase())),
  );

function Harness({
  search = find,
  initial = [],
  onChange,
}: {
  search?: (q: string) => Promise<Person[]>;
  initial?: Person[];
  onChange?: (p: Person[]) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <PeoplePicker
      label="Add people"
      value={value}
      search={search}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}
const box = () => screen.getByRole('combobox', { name: 'Add people' }) as HTMLInputElement;
const type = async (text: string) => {
  fireEvent.change(box(), { target: { value: text } });
  await screen.findByRole('listbox');
};
const expanded = () => box().getAttribute('aria-expanded');

describe('PeoplePicker', () => {
  it('is a combobox over a multiselectable listbox, closed until something is asked', async () => {
    const { container } = render(<Harness />);
    expect(expanded()).toBe('false');
    expect(box().placeholder).toBe('Search name or email');
    await type('a');
    expect(expanded()).toBe('true');
    const list = screen.getByRole('listbox');
    expect(list.getAttribute('aria-multiselectable')).toBe('true');
    expect(box().getAttribute('aria-controls')).toBe(list.id);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(box().getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]?.id);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('highlights the match, shows role, and announces the count politely', async () => {
    render(<Harness />);
    await type('ash');
    expect(screen.getAllByText('ash', { selector: 'mark' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Educator/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('1 person matches'));
    await type('a');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('3 people match'));
  });

  it('choosing a row adds a chip, clears the text, closes the list and keeps focus', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await type('ar');
    expect(fireEvent.mouseDown(screen.getByRole('option', { name: /Arjun Rao/ }))).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith([PEOPLE[1]]);
    expect(box().value).toBe('');
    expect(expanded()).toBe('false');
    expect(document.activeElement).toBe(box());
    expect(box().placeholder).toBe('');
    expect(screen.getByRole('list', { name: 'Add people: added people' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('marks people already added, and choosing one again adds nothing', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[PEOPLE[0] as Person]} onChange={onChange} />);
    await type('asha');
    expect(screen.getByText('Added')).toBeTruthy();
    expect(screen.getByRole('option', { selected: true })).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('option'));
    expect(onChange).not.toHaveBeenCalled();
    expect(box().value).toBe('');
  });

  it('keys: ArrowDown and ArrowUp move (wrapping), Enter picks, ArrowDown reopens', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await type('a');
    const options = () => screen.getAllByRole('option');
    const activeId = () => box().getAttribute('aria-activedescendant');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(activeId()).toBe(options()[1]?.id);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    expect(activeId()).toBe(options()[2]?.id);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    expect(activeId()).toBe(options()[0]?.id);
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith([PEOPLE[0]]);
    expect(expanded()).toBe('false');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    await waitFor(() => expect(expanded()).toBe('true'));
  });

  it('Enter with nothing found picks nothing; ArrowUp and Enter when closed do nothing', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await type('zzz');
    expect(screen.getByText('No one matches “zzz”')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('0 people match'));
    expect(box().getAttribute('aria-activedescendant')).toBeNull();
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowUp' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('with no text, an open list asks to type', async () => {
    render(<Harness search={() => Promise.resolve([])} />);
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    await screen.findByText('Type a name or email');
  });

  it('Escape closes the list but not the dialog around it; a second Escape reaches the dialog', async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Team">
        <Harness />
      </Dialog>,
    );
    await type('a');
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(expanded()).toBe('false');
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('Backspace on an empty field removes the last chip; with text or no chips it does nothing', () => {
    const onChange = vi.fn();
    render(<Harness initial={[PEOPLE[0] as Person, PEOPLE[1] as Person]} onChange={onChange} />);
    fireEvent.change(box(), { target: { value: 'q' } });
    fireEvent.keyDown(box(), { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(box(), { target: { value: '' } });
    fireEvent.keyDown(box(), { key: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith([PEOPLE[0]]);
    fireEvent.keyDown(box(), { key: 'Backspace' });
    fireEvent.keyDown(box(), { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(box(), { key: 'x' });
  });

  it('a chip has a labelled remove button that returns focus to the field', async () => {
    const onChange = vi.fn();
    render(<Harness initial={[PEOPLE[2] as Person]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove meera@example.com' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(document.activeElement).toBe(box());
  });

  it('shows only the newest search, and a late answer cannot reopen a closed list', async () => {
    const resolvers: Array<(p: Person[]) => void> = [];
    const slow = () => new Promise<Person[]>((r) => resolvers.push(r));
    render(<Harness search={slow} />);
    fireEvent.change(box(), { target: { value: 'as' } });
    fireEvent.change(box(), { target: { value: 'asha' } });
    await act(async () => resolvers[1]?.([PEOPLE[0] as Person]));
    await act(async () => resolvers[0]?.(PEOPLE));
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.change(box(), { target: { value: 'ar' } });
    fireEvent.blur(box());
    await act(async () => resolvers[2]?.(PEOPLE));
    expect(expanded()).toBe('false');
  });

  it('takes a custom remove label and placeholder', () => {
    render(
      <PeoplePicker
        label="Who"
        value={[PEOPLE[0] as Person]}
        search={find}
        onChange={() => {}}
        placeholder="Find"
        removeLabel={(p) => `Drop ${p.email}`}
      />,
    );
    expect(screen.getByRole('button', { name: 'Drop asha@example.com' })).toBeTruthy();
  });
});

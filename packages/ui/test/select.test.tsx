import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, Select } from '../src';
import type { SelectProps } from '../src';
import { axeViolations } from './axe';

const TEAMS = ['Android', 'Backend', 'Bangalore', 'Design', 'Flutter', 'Frontend', 'iOS', 'QA'];

function Teams(props: Partial<SelectProps>) {
  return (
    <Select label="Team" {...props}>
      <option value="">Any team</option>
      {TEAMS.map((t) => (
        <option key={t} value={t.toLowerCase()}>
          {t}
        </option>
      ))}
    </Select>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Team' });
const key = (k: string, init: Partial<KeyboardEventInit> = {}) =>
  fireEvent.keyDown(box(), { key: k, ...init });
const activeName = () =>
  document.getElementById(box().getAttribute('aria-activedescendant') ?? '')?.textContent;
const isOpen = () => box().getAttribute('aria-expanded') === 'true';

afterEach(() => vi.restoreAllMocks());

describe('Select', () => {
  it('is a labelled combobox showing the chosen option, with a closed listbox', () => {
    render(<Teams defaultValue="design" />);
    const combo = box();
    expect(combo.textContent).toBe('Design');
    expect(combo.tabIndex).toBe(0);
    expect(combo.getAttribute('aria-haspopup')).toBe('listbox');
    expect(isOpen()).toBe(false);
    expect(combo.hasAttribute('aria-activedescendant')).toBe(false);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByLabelText('Team')).toBe(combo);
    fireEvent.click(combo);
    expect(document.getElementById(combo.getAttribute('aria-controls') ?? '')).toBe(
      screen.getByRole('listbox', { name: 'Team' }),
    );
  });

  it('shows the first option without a value, and an option without value uses its text', () => {
    const onChange = vi.fn();
    render(
      <Select label="Course" onChange={onChange}>
        <option>Git basics</option>
        <option>{'React '}hooks</option>
      </Select>,
    );
    const combo = screen.getByRole('combobox', { name: 'Course' });
    expect(combo.textContent).toBe('Git basics');
    fireEvent.click(combo);
    fireEvent.click(screen.getByRole('option', { name: 'React hooks' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'React hooks' } });
    expect(combo.textContent).toBe('React hooks');
  });

  it('links hint and error, and marks the control invalid', () => {
    render(<Teams hint="Learners pick from this list" error="Pick a team" />);
    const combo = box();
    expect(combo.getAttribute('aria-invalid')).toBe('true');
    const ids = (combo.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((i) => document.getElementById(i)?.textContent)).toEqual([
      'Learners pick from this list',
      'Pick a team',
    ]);
  });

  it('click opens, hover highlights, click chooses and closes', () => {
    const onChange = vi.fn();
    render(<Teams value="" onChange={onChange} />);
    fireEvent.click(box());
    expect(isOpen()).toBe(true);
    expect(activeName()).toBe('Any team');
    expect(screen.getByRole('option', { selected: true }).textContent).toBe('Any team');
    const ios = screen.getByRole('option', { name: 'iOS' });
    fireEvent.mouseMove(ios);
    expect(activeName()).toBe('iOS');
    expect(ios.className).toContain('g-select__option--active');
    fireEvent.click(ios);
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'ios' } });
    expect(isOpen()).toBe(false);
    // Controlled: the shown value waits for the parent.
    expect(box().textContent).toBe('Any team');
  });

  it('a second click closes without a change; choosing the current option fires nothing', () => {
    const onChange = vi.fn();
    render(<Teams defaultValue="qa" onChange={onChange} />);
    fireEvent.click(box());
    fireEvent.click(box());
    expect(isOpen()).toBe(false);
    fireEvent.click(box());
    fireEvent.click(screen.getByRole('option', { name: 'QA' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the check marks the chosen option only', () => {
    render(<Teams defaultValue="backend" />);
    fireEvent.click(box());
    const chosen = screen.getByRole('option', { name: 'Backend' });
    expect(chosen.getAttribute('aria-selected')).toBe('true');
    expect(chosen.querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('option', { name: 'QA' }).querySelector('svg')).toBeNull();
  });

  it('a mouse press in the list keeps focus on the control', () => {
    render(<Teams />);
    fireEvent.click(box());
    const press = fireEvent.mouseDown(screen.getByRole('listbox'));
    expect(press).toBe(false);
  });

  it.each(['Enter', ' ', 'ArrowDown', 'ArrowUp'])('%j opens on the chosen option', (k) => {
    render(<Teams defaultValue="flutter" />);
    key(k);
    expect(isOpen()).toBe(true);
    expect(activeName()).toBe('Flutter');
  });

  it('Alt+ArrowDown opens', () => {
    render(<Teams />);
    key('ArrowDown', { altKey: true });
    expect(isOpen()).toBe(true);
  });

  it('Home and End open on the first and last option', () => {
    render(<Teams defaultValue="design" />);
    key('End');
    expect(activeName()).toBe('QA');
    key('Escape');
    key('Home');
    expect(activeName()).toBe('Any team');
  });

  it('other keys do nothing while closed', () => {
    render(<Teams />);
    key('Escape');
    key('Tab');
    key('PageDown');
    expect(isOpen()).toBe(false);
  });

  it('arrows, Home, End, PageUp and PageDown move within the ends', () => {
    render(<Teams defaultValue="" />);
    key('Enter');
    key('ArrowUp');
    expect(activeName()).toBe('Any team');
    key('ArrowDown');
    key('ArrowDown');
    expect(activeName()).toBe('Backend');
    key('PageDown');
    expect(activeName()).toBe('QA');
    key('ArrowDown');
    expect(activeName()).toBe('QA');
    key('PageUp');
    expect(activeName()).toBe('Any team');
    key('End');
    expect(activeName()).toBe('QA');
    key('Home');
    expect(activeName()).toBe('Any team');
  });

  it('Enter and Space choose the active option and close', () => {
    const onChange = vi.fn();
    render(<Teams onChange={onChange} />);
    key('Enter');
    key('ArrowDown');
    key('Enter');
    expect(onChange).toHaveBeenLastCalledWith({ target: { value: 'android' } });
    expect(isOpen()).toBe(false);
    key(' ');
    key('ArrowDown');
    key(' ');
    expect(onChange).toHaveBeenLastCalledWith({ target: { value: 'backend' } });
    expect(box().textContent).toBe('Backend');
  });

  it('Escape closes without a change, keeps focus, and does not close a dialog around it', () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <Dialog open title="Publish" onClose={onClose}>
        <Teams onChange={onChange} />
      </Dialog>,
    );
    expect(document.activeElement).toBe(box());
    key('Enter');
    key('ArrowDown');
    key('Escape');
    expect(isOpen()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(box());
    key('Escape');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Tab chooses the active option and lets focus move on', () => {
    const onChange = vi.fn();
    render(<Teams onChange={onChange} />);
    key('Enter');
    key('End');
    const tab = fireEvent.keyDown(box(), { key: 'Tab' });
    expect(tab).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'qa' } });
    expect(isOpen()).toBe(false);
  });

  it('typing opens on the first match, a repeated letter cycles, a quick prefix narrows', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    render(<Teams />);
    key('b');
    expect(isOpen()).toBe(true);
    expect(activeName()).toBe('Backend');
    now.mockReturnValue(11_000);
    key('B');
    expect(activeName()).toBe('Bangalore');
    now.mockReturnValue(12_000);
    key('f');
    expect(activeName()).toBe('Flutter');
    now.mockReturnValue(12_100);
    key('r');
    expect(activeName()).toBe('Frontend');
    now.mockReturnValue(13_000);
    key('z');
    expect(activeName()).toBe('Frontend');
  });

  it('a space typed during a search extends it; after the pause it chooses', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(20_000);
    const onChange = vi.fn();
    render(
      <Select label="Team" onChange={onChange}>
        <option value="issued">Certificate issued</option>
        <option value="revoked">Certificate revoked</option>
        <option value="course">Course published</option>
      </Select>,
    );
    for (const [i, k] of [...'certificate'].entries()) {
      now.mockReturnValue(20_000 + i * 100);
      key(k);
    }
    now.mockReturnValue(21_100);
    expect(key(' ')).toBe(false);
    expect(isOpen()).toBe(true);
    now.mockReturnValue(21_200);
    key('r');
    expect(activeName()).toBe('Certificate revoked');
    expect(onChange).not.toHaveBeenCalled();
    now.mockReturnValue(22_000);
    key(' ');
    expect(isOpen()).toBe(false);
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'revoked' } });
  });

  it('a click on the label focuses the control without opening it, unless disabled', () => {
    const { unmount } = render(<Teams />);
    fireEvent.click(screen.getByText('Team'));
    expect(document.activeElement).toBe(box());
    expect(isOpen()).toBe(false);
    unmount();
    render(<Teams disabled />);
    fireEvent.click(screen.getByText('Team'));
    expect(document.activeElement).not.toBe(box());
  });

  it('typing while closed starts after the chosen option', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_000);
    render(<Teams defaultValue="backend" />);
    key('b');
    expect(activeName()).toBe('Bangalore');
  });

  it('ignores shortcuts and named keys for typeahead', () => {
    render(<Teams />);
    key('a', { ctrlKey: true });
    key('a', { metaKey: true });
    key('Shift');
    expect(isOpen()).toBe(false);
  });

  it('closes when focus leaves', () => {
    render(
      <>
        <Teams />
        <button type="button">Next</button>
      </>,
    );
    act(() => box().focus());
    key('Enter');
    act(() => screen.getByRole('button', { name: 'Next' }).focus());
    expect(isOpen()).toBe(false);
  });

  it('scrolls the active option into view where the browser can', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      render(<Teams />);
      key('Enter');
      key('End');
      expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });

  it('opens below the control with the room below, and above it when only above has room', () => {
    const rect = (top: number) =>
      ({ top, bottom: top + 44, left: 20, width: 300, height: 44, right: 320 }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect');
    spy.mockReturnValue(rect(100));
    render(<Teams />);
    key('Enter');
    const list = screen.getByRole('listbox');
    expect(list.style.top).toBe(`${100 + 44 + 4}px`);
    expect(list.style.left).toBe('20px');
    expect(list.style.width).toBe('300px');
    expect(list.style.getPropertyValue('--select-room')).toBe(`${768 - 144 - 16}px`);
    expect(list.className).toBe('g-select__list');
    // The page scrolls the control near the bottom: the list follows it and flips up.
    spy.mockReturnValue(rect(700));
    fireEvent.scroll(window);
    expect(list.style.bottom).toBe(`${768 - 700 + 4}px`);
    expect(list.style.top).toBe('');
    expect(list.className).toBe('g-select__list g-select__list--up');
    expect(list.style.getPropertyValue('--select-room')).toBe(`${700 - 16}px`);
    spy.mockReturnValue(rect(100));
    fireEvent(window, new Event('resize'));
    expect(list.className).toBe('g-select__list');
    key('Escape');
  });

  it('works uncontrolled with no onChange', () => {
    render(<Teams />);
    fireEvent.click(box());
    fireEvent.click(screen.getByRole('option', { name: 'Design' }));
    expect(box().textContent).toBe('Design');
  });

  it('a value matching no option shows the first', () => {
    render(<Teams value="gone" onChange={() => {}} />);
    expect(box().textContent).toBe('Any team');
  });

  it('a controlled value follows the parent', () => {
    function Parent() {
      const [team, setTeam] = useState('qa');
      return <Teams value={team} onChange={(e) => setTeam(e.target.value)} />;
    }
    render(<Parent />);
    fireEvent.click(box());
    fireEvent.click(screen.getByRole('option', { name: 'iOS' }));
    expect(box().textContent).toBe('iOS');
  });

  it('disabled: out of the tab order, does not open', () => {
    render(<Teams disabled defaultValue="design" />);
    const combo = box();
    expect(combo.getAttribute('aria-disabled')).toBe('true');
    expect(combo.tabIndex).toBe(-1);
    fireEvent.click(combo);
    key('Enter');
    expect(isOpen()).toBe(false);
  });

  it('with no options it is empty and the keyboard does nothing', () => {
    render(<Select label="Team">{null}</Select>);
    expect(box().textContent).toBe('');
    key('Enter');
    expect(isOpen()).toBe(false);
    fireEvent.click(box());
    expect(isOpen()).toBe(true);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('inside a dialog, the first field gets focus and the list is fixed so the body cannot clip it', () => {
    render(
      <Dialog open title="Publish" onClose={() => {}}>
        <Teams />
      </Dialog>,
    );
    expect(document.activeElement).toBe(box());
    fireEvent.click(box());
    expect(screen.getByRole('listbox').closest('[role="dialog"]')).not.toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(TEAMS.length + 1);
  });

  it('has no axe violations closed, open, invalid and disabled', async () => {
    const { container } = render(
      <form>
        <Teams hint="Learners pick from this list" />
        <Select label="Status" hideLabel error="Pick one">
          <option>Any status</option>
        </Select>
        <Select label="Locked" disabled>
          <option>Web</option>
        </Select>
      </form>,
    );
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(box());
    expect(await axeViolations(container)).toEqual([]);
  });
});

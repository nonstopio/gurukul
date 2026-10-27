import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Field, Input, Select, Tabs, Textarea, Toggle, type TabsProps } from '../src';
import { axeViolations } from './axe';

describe('Field controls', () => {
  it('Input is labelled by its label', () => {
    render(<Input label="Full name" placeholder="Asha" className="x" />);
    const input = screen.getByLabelText('Full name');
    expect(input.tagName).toBe('INPUT');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('links a hint and an error to the control', () => {
    render(<Input label="Email" hint="Use your work address" error="Enter a valid email" />);
    const input = screen.getByLabelText('Email');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(document.getElementById(described[0] ?? '')?.textContent).toBe('Use your work address');
    expect(document.getElementById(described[1] ?? '')?.textContent).toBe('Enter a valid email');
  });

  it('links an error with no hint', () => {
    render(<Input label="Email" error="Required" />);
    const input = screen.getByLabelText('Email');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'Required',
    );
  });

  it('uses a given id', () => {
    render(<Input label="Name" id="custom" />);
    expect(screen.getByLabelText('Name').id).toBe('custom');
  });

  it('Select renders its options and is labelled', () => {
    render(
      <Select label="Role" error="Pick one" defaultValue="b">
        <option value="a">Shishya</option>
        <option value="b">Acharya</option>
      </Select>,
    );
    const select = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement;
    expect(select.value).toBe('b');
    expect(select.getAttribute('aria-invalid')).toBe('true');
  });

  it('Textarea is labelled and editable', () => {
    const onChange = vi.fn();
    render(<Textarea label="Summary" onChange={onChange} />);
    const area = screen.getByLabelText('Summary');
    expect(area.tagName).toBe('TEXTAREA');
    fireEvent.change(area, { target: { value: 'hi' } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('Field hands any control the props it needs', () => {
    render(
      <Field label="Custom" hint="h">
        {(c) => <input data-testid="c" {...c} />}
      </Field>,
    );
    expect(screen.getByLabelText('Custom')).toBe(screen.getByTestId('c'));
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <form>
        <Input label="Name" hint="Your full name" />
        <Input label="Email" error="Enter a valid email" />
        <Select label="Role">
          <option>Shishya</option>
        </Select>
        <Textarea label="Notes" />
      </form>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Toggle', () => {
  it('is a labelled switch that toggles', () => {
    const onChange = vi.fn();
    render(<Toggle label="Published" onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Published' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('is a focusable native checkbox, so Space toggles it in a browser', () => {
    render(<Toggle label="Published" />);
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.type).toBe('checkbox');
    expect(toggle.tabIndex).toBe(0);
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
  });

  it('can start on, be disabled, and takes a class', () => {
    render(<Toggle label="Locked" defaultChecked disabled className="x" />);
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(toggle.disabled).toBe(true);
    expect(toggle.closest('label')?.className).toBe('g-toggle x');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <Toggle label="On" defaultChecked />
        <Toggle label="Off" />
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

const tabs: TabsProps['tabs'] = [
  { id: 'a', label: 'Overview', panel: <p>Overview body</p> },
  { id: 'b', label: 'Lessons', panel: <p>Lessons body</p> },
  { id: 'c', label: 'Settings', panel: <p>Settings body</p> },
];

function tabEls(): [HTMLElement, HTMLElement, HTMLElement] {
  return screen.getAllByRole('tab') as [HTMLElement, HTMLElement, HTMLElement];
}

describe('Tabs', () => {
  it('selects the first tab by default with roving tabindex and wired panels', () => {
    render(<Tabs tabs={tabs} label="Course" />);
    expect(screen.getByRole('tablist', { name: 'Course' })).toBeTruthy();
    const [a, b] = tabEls();
    expect(a.getAttribute('aria-selected')).toBe('true');
    expect(a.tabIndex).toBe(0);
    expect(b.getAttribute('aria-selected')).toBe('false');
    expect(b.tabIndex).toBe(-1);
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(a.id);
    expect(a.getAttribute('aria-controls')).toBe(panel.id);
    expect(screen.getByText('Overview body')).toBeTruthy();
    expect(screen.getByText('Lessons body').parentElement?.hidden).toBe(true);
    expect(panel.hidden).toBe(false);
  });

  it('honours defaultValue', () => {
    render(<Tabs tabs={tabs} label="Course" defaultValue="c" />);
    expect(screen.getByRole('tab', { name: 'Settings' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('selects on click and reports the change', () => {
    const onValueChange = vi.fn();
    render(<Tabs tabs={tabs} label="Course" onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Lessons' }));
    expect(screen.getByRole('tabpanel').textContent).toBe('Lessons body');
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('moves with arrows (wrapping), Home and End, and focuses the new tab', () => {
    render(<Tabs tabs={tabs} label="Course" />);
    const [a, b, c] = tabEls();
    a.focus();
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(b);
    expect(b.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(b, { key: 'End' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(c);
    fireEvent.keyDown(c, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: 'Home' });
    expect(document.activeElement).toBe(a);
  });

  it('ignores other keys', () => {
    render(<Tabs tabs={tabs} label="Course" />);
    const [a] = tabEls();
    a.focus();
    const notPrevented = fireEvent.keyDown(a, { key: 'x' });
    expect(notPrevented).toBe(true);
    expect(a.getAttribute('aria-selected')).toBe('true');
  });

  it('follows `value` when controlled', () => {
    const onValueChange = vi.fn();
    const { rerender } = render(
      <Tabs tabs={tabs} label="Course" value="b" onValueChange={onValueChange} />,
    );
    expect(screen.getByText('Lessons body')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(onValueChange).toHaveBeenCalledWith('c');
    expect(screen.getByText('Lessons body')).toBeTruthy();
    rerender(<Tabs tabs={tabs} label="Course" value="c" onValueChange={onValueChange} />);
    expect(screen.getByText('Settings body')).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Tabs tabs={tabs} label="Course" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

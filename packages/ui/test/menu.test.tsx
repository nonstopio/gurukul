import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Menu } from '../src/Menu';
import type { MenuEntry } from '../src/Menu';
import { axeViolations } from './axe';

function setup(extra: Partial<React.ComponentProps<typeof Menu>> = {}) {
  const edit = vi.fn();
  const archive = vi.fn();
  const remove = vi.fn();
  const items: MenuEntry[] = [
    { label: 'Edit', onSelect: edit, icon: <svg />, hint: 'E' },
    { label: 'Export', onSelect: vi.fn(), disabled: true },
    { label: 'Archive', onSelect: archive },
    { separator: true },
    { label: 'Delete', onSelect: remove, danger: true },
  ];
  render(
    <>
      <Menu label="Course actions" items={items} {...extra} />
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Course actions' });
  return { trigger, edit, archive, remove };
}
const menu = () => screen.queryByRole('menu');
const item = (name: string) => screen.getByRole('menuitem', { name: new RegExp(`^${name}`) });
const focused = () => document.activeElement;

describe('Menu', () => {
  it('trigger is a closed menu button with the default icon and class', () => {
    const { trigger } = setup();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBeTruthy();
    expect(trigger.className).toBe('g-menu__trigger');
    expect(trigger.querySelector('svg')).toBeTruthy();
    expect(menu()).toBeNull();
  });

  it('click opens a menu labelled by the trigger and focuses the first enabled item', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const m = menu() as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(m.id);
    expect(m.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(screen.getByRole('menu', { name: 'Course actions' })).toBe(m);
    expect(m.className).toBe('g-menu__panel g-menu__panel--bottom g-menu__panel--end');
    expect(focused()).toBe(item('Edit'));
    expect(screen.getByRole('separator')).toBeTruthy();
    expect(item('Delete').className).toContain('g-menu__item--danger');
    expect(item('Export').getAttribute('aria-disabled')).toBe('true');
    expect(item('Edit').getAttribute('aria-disabled')).toBeNull();
    expect(item('Edit').textContent).toBe('EditE');
  });

  it('click on an open trigger closes it', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(menu()).toBeNull();
  });

  it.each(['Enter', ' ', 'ArrowDown'])('%j on the trigger opens at the first item', (key) => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key });
    expect(focused()).toBe(item('Edit'));
  });

  it('ArrowUp on the trigger opens at the last item; other keys do nothing', () => {
    const { trigger } = setup();
    fireEvent.keyDown(trigger, { key: 'x' });
    expect(menu()).toBeNull();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(focused()).toBe(item('Delete'));
  });

  it('arrows move with wrap and skip disabled items; Home and End jump', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const m = menu() as HTMLElement;
    fireEvent.keyDown(m, { key: 'ArrowDown' });
    expect(focused()).toBe(item('Archive'));
    fireEvent.keyDown(m, { key: 'ArrowDown' });
    expect(focused()).toBe(item('Delete'));
    fireEvent.keyDown(m, { key: 'ArrowDown' });
    expect(focused()).toBe(item('Edit'));
    fireEvent.keyDown(m, { key: 'ArrowUp' });
    expect(focused()).toBe(item('Delete'));
    fireEvent.keyDown(m, { key: 'ArrowUp' });
    expect(focused()).toBe(item('Archive'));
    fireEvent.keyDown(m, { key: 'ArrowUp' });
    expect(focused()).toBe(item('Edit'));
    fireEvent.keyDown(m, { key: 'End' });
    expect(focused()).toBe(item('Delete'));
    fireEvent.keyDown(m, { key: 'Home' });
    expect(focused()).toBe(item('Edit'));
  });

  it('ArrowUp from outside the enabled items goes to the last one', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    item('Export').focus();
    fireEvent.keyDown(menu() as HTMLElement, { key: 'ArrowUp' });
    expect(focused()).toBe(item('Delete'));
  });

  it('a typed letter jumps to the next item starting with it, wrapping; modifiers and misses do nothing', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const m = menu() as HTMLElement;
    fireEvent.keyDown(m, { key: 'd' });
    expect(focused()).toBe(item('Delete'));
    fireEvent.keyDown(m, { key: 'E' });
    expect(focused()).toBe(item('Edit'));
    fireEvent.keyDown(m, { key: 'e' }); // Export is disabled: stays on Edit
    expect(focused()).toBe(item('Edit'));
    fireEvent.keyDown(m, { key: 'z' });
    fireEvent.keyDown(m, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(m, { key: 'a', metaKey: true });
    fireEvent.keyDown(m, { key: 'a', altKey: true });
    fireEvent.keyDown(m, { key: 'Shift' });
    expect(focused()).toBe(item('Edit'));
    fireEvent.keyDown(m, { key: 'a' });
    expect(focused()).toBe(item('Archive'));
  });

  it.each(['Enter', ' '])('%j on an item chooses it, closes and returns focus', (key) => {
    const { trigger, archive } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(menu() as HTMLElement, { key: 'a' });
    fireEvent.keyDown(menu() as HTMLElement, { key });
    expect(archive).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    expect(focused()).toBe(trigger);
  });

  it('click on an item chooses it, closes and returns focus', () => {
    const { trigger, remove } = setup();
    fireEvent.click(trigger);
    fireEvent.click(item('Delete'));
    expect(remove).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    expect(focused()).toBe(trigger);
  });

  it('a disabled item does nothing', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(item('Export'));
    expect(menu()).toBeTruthy();
  });

  it('Escape closes, returns focus to the trigger and goes no further', () => {
    const { trigger } = setup();
    const outer = vi.fn();
    document.addEventListener('keydown', outer);
    fireEvent.click(trigger);
    fireEvent.keyDown(menu() as HTMLElement, { key: 'Escape' });
    document.removeEventListener('keydown', outer);
    expect(menu()).toBeNull();
    expect(focused()).toBe(trigger);
    expect(outer).not.toHaveBeenCalled();
  });

  it('Tab closes without taking focus back', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(menu() as HTMLElement, { key: 'Tab' });
    expect(menu()).toBeNull();
    expect(focused()).not.toBe(trigger);
  });

  it('a press outside closes it; a press inside does not', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.pointerDown(item('Edit'));
    expect(menu()).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(menu()).toBeNull();
  });

  it('opens above and aligned to the start, with a custom trigger and classes', () => {
    setup({
      placement: 'top',
      align: 'start',
      trigger: <span>Me</span>,
      triggerClassName: 'custom',
      className: 'wrap',
    });
    const trigger = screen.getByRole('button', { name: 'Course actions' });
    expect(trigger.className).toBe('custom');
    expect(trigger.textContent).toBe('Me');
    expect((trigger.parentElement as HTMLElement).className).toBe('g-menu wrap');
    fireEvent.click(trigger);
    expect((menu() as HTMLElement).className).toBe(
      'g-menu__panel g-menu__panel--top g-menu__panel--start',
    );
  });

  it('with every item disabled, opening and the arrow keys do nothing harmful', () => {
    render(<Menu label="Nothing" items={[{ label: 'Off', onSelect: vi.fn(), disabled: true }]} />);
    const trigger = screen.getByRole('button', { name: 'Nothing' });
    fireEvent.click(trigger);
    fireEvent.keyDown(menu() as HTMLElement, { key: 'ArrowDown' });
    expect(menu()).toBeTruthy();
    expect(focused()).toBe(document.body);
  });

  it('has no axe violations closed or open', async () => {
    const { trigger } = setup();
    const root = trigger.parentElement as HTMLElement;
    expect(await axeViolations(root)).toEqual([]);
    fireEvent.click(trigger);
    expect(await axeViolations(root)).toEqual([]);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, type PaletteItem } from '../src';
import { axeViolations } from './axe';

const items: PaletteItem[] = [
  { id: 'home', label: 'Home', sub: 'Gurukul', kind: 'Page' },
  { id: 'changelog', label: 'Changelog' },
  { id: 'learners', label: 'Learners', sub: 'Kulapati console', kind: 'Page' },
];
const search = (q: string) => items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

function setup(over: Partial<Parameters<typeof CommandPalette>[0]> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <CommandPalette
      open
      onClose={onClose}
      search={search}
      onSelect={onSelect}
      label="Search Gurukul"
      {...over}
    />,
  );
  return { onSelect, onClose, view, input: screen.getByRole('combobox') };
}
const options = () => screen.getAllByRole('option');
const selected = () => options().findIndex((o) => o.getAttribute('aria-selected') === 'true');

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(
      <CommandPalette
        open={false}
        onClose={vi.fn()}
        search={search}
        onSelect={vi.fn()}
        label="x"
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a labelled modal dialog with focus in the combobox', () => {
    const { input } = setup();
    expect(screen.getByRole('dialog', { name: 'Search Gurukul' }).getAttribute('aria-modal')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('placeholder')).toBe('Search…');
    expect(options().map((o) => o.textContent)).toEqual([
      'HomeGurukulPage',
      'Changelog',
      'LearnersKulapati consolePage',
    ]);
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
  });

  it('filters as you type and announces the count', () => {
    const { input } = setup();
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.change(input, { target: { value: 'learn' } });
    expect(options()).toHaveLength(1);
    expect(screen.getByRole('status').textContent).toBe('1 result');
    fireEvent.change(input, { target: { value: 'e' } });
    expect(screen.getByRole('status').textContent).toBe('3 results');
  });

  it('tells the caller what is typed, from the empty query on open', () => {
    const onQueryChange = vi.fn();
    const { input } = setup({ onQueryChange });
    expect(onQueryChange).toHaveBeenLastCalledWith('');
    fireEvent.change(input, { target: { value: 'lea' } });
    expect(onQueryChange).toHaveBeenLastCalledWith('lea');
    expect(onQueryChange).toHaveBeenCalledTimes(2);
  });

  it('re-runs a new search over what is typed, for results that arrived later', () => {
    const { input, view } = setup();
    fireEvent.change(input, { target: { value: 'ana' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    const later = (q: string) => [{ id: 'p', label: `Ana (${q})`, kind: 'Person' }];
    view.rerender(
      <CommandPalette
        open
        onClose={vi.fn()}
        search={later}
        onSelect={vi.fn()}
        label="Search Gurukul"
      />,
    );
    expect(options()[0]?.textContent).toContain('Ana (ana)');
  });

  it('moves with the arrows, clamped at both ends, and opens with Enter', () => {
    const { input, onSelect } = setup();
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(selected()).toBe(0);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(selected()).toBe(2);
    fireEvent.keyDown(input, { key: 'x' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(items[2]);
  });

  it('selects with the mouse without taking focus from the combobox', () => {
    const { onSelect } = setup();
    expect(fireEvent.mouseDown(options()[1] as HTMLElement)).toBe(false);
    fireEvent.mouseMove(options()[1] as HTMLElement);
    expect(selected()).toBe(1);
    fireEvent.click(options()[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('ignores Enter while an IME is composing, and keys when nothing matches', () => {
    const { input, onSelect } = setup();
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(onSelect).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-activedescendant')).toBeNull();
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('Nothing matches “zzz”.')).toBeTruthy();
  });

  it('closes on Escape and on the backdrop, and keeps Tab inside', () => {
    const { input, onClose } = setup({ emptyText: 'No pages match' });
    const tab = fireEvent.keyDown(input, { key: 'Tab' });
    expect(tab).toBe(false);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close search gurukul' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.change(input, { target: { value: 'qq' } });
    expect(screen.getByText('No pages match “qq”.')).toBeTruthy();
  });

  it('shows a page of results, then the rest on request', () => {
    const { input } = setup({ pageSize: 1 });
    expect(options().map((o) => o.textContent)).toEqual(['HomeGurukulPage', 'Show 2 more results']);
    fireEvent.mouseMove(options()[1] as HTMLElement);
    fireEvent.click(options()[1] as HTMLElement);
    expect(options()).toHaveLength(3);
    fireEvent.change(input, { target: { value: 'e' } });
    expect(options().map((o) => o.textContent)).toEqual(['HomeGurukulPage', 'Show 2 more results']);
    fireEvent.change(input, { target: { value: 'learn' } });
    expect(options()).toHaveLength(1);
  });

  it('says "1 more result" in the singular and opens it with Enter', () => {
    const { input } = setup({ pageSize: 2 });
    expect(options()[2]?.textContent).toBe('Show 1 more result');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(options()).toHaveLength(3);
  });

  it('returns focus to where it was when it closes', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          <CommandPalette
            open={open}
            onClose={() => setOpen(false)}
            search={search}
            onSelect={vi.fn()}
            label="Search"
          />
        </>
      );
    }
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
    act(() => {
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    });
    expect(document.activeElement).toBe(opener);
  });
});

describe('CommandPalette accessibility', () => {
  it('has no axe violations with results, with "show more", and with none', async () => {
    const { input } = setup({ pageSize: 1 });
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

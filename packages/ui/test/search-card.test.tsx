import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchCard } from '../src';
import { axeViolations } from './axe';

const search = (value = '', onChange = vi.fn()) => ({ value, onChange, label: 'Search courses' });

describe('SearchCard', () => {
  it('is a search region with a named field that reports what is typed', () => {
    const onChange = vi.fn();
    render(<SearchCard label="Find a course" search={search('', onChange)} />);
    expect(screen.getByRole('search', { name: 'Find a course' })).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search courses' }), {
      target: { value: 'git' },
    });
    expect(onChange).toHaveBeenCalledWith('git');
  });

  it('uses the label as the placeholder unless one is given', () => {
    const { rerender } = render(<SearchCard label="x" search={search()} />);
    expect(screen.getByPlaceholderText('Search courses')).toBeTruthy();
    rerender(<SearchCard label="x" search={{ ...search(), placeholder: 'By name or topic' }} />);
    expect(screen.getByPlaceholderText('By name or topic')).toBeTruthy();
  });

  it('clears the search with its button and keeps focus in the field', () => {
    const onChange = vi.fn();
    render(<SearchCard label="x" search={search('git', onChange)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onChange).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('shows no clear button for an empty search, and Escape clears only a filled one', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SearchCard label="x" search={search('', onChange)} />);
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    rerender(<SearchCard label="x" search={search('git', onChange)} />);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'a' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows the views, the filters and the count', () => {
    render(
      <SearchCard
        label="x"
        search={search()}
        views={<button type="button">All</button>}
        filters={<button type="button">Level</button>}
        count="1 of 4 courses"
      />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Level' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('1 of 4 courses');
  });

  it('shows a toolbar with only views, or only filters', () => {
    const { rerender } = render(
      <SearchCard label="x" search={search()} views={<button type="button">All</button>} />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    rerender(
      <SearchCard label="x" search={search()} filters={<button type="button">Level</button>} />,
    );
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Level' })).toBeTruthy();
  });

  it('lists the filters that are on, each removable, with a clear-all', () => {
    const remove = vi.fn();
    const clear = vi.fn();
    render(
      <SearchCard
        label="x"
        search={search()}
        active={[{ id: 'level', label: 'Level: Foundation', onRemove: remove }]}
        onClear={clear}
        clearLabel="Reset"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Level: Foundation' }));
    expect(remove).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(clear).toHaveBeenCalled();
  });

  it('offers clear-all for a search alone, but not when nothing is on or no handler is given', () => {
    const { rerender } = render(<SearchCard label="x" search={search('git')} onClear={() => {}} />);
    expect(screen.getByRole('button', { name: 'Clear all filters' })).toBeTruthy();
    rerender(<SearchCard label="x" search={search('')} onClear={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
    rerender(<SearchCard label="x" search={search('git')} />);
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <SearchCard
        label="Find a course"
        search={search('git')}
        views={<button type="button">All</button>}
        active={[{ id: 'a', label: 'Level: Foundation', onRemove: () => {} }]}
        onClear={() => {}}
        count="1 course"
      />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input, Select, Toggle } from '../src';
import { FilterBar } from '../src/FilterBar';
import { axeViolations } from './axe';

function Bar(props: { canClear?: boolean; onClear?: () => void; count?: string }) {
  return (
    <FilterBar label="Filter learners" {...props}>
      <Input label="Search learners" hideLabel placeholder="Name or email" />
      <Select label="Status" hideLabel>
        <option>Any status</option>
        <option>Completed</option>
      </Select>
      <Toggle label="Overdue only" />
    </FilterBar>
  );
}

describe('FilterBar', () => {
  it('is a named group holding its filters', () => {
    render(<Bar />);
    const group = screen.getByRole('group', { name: 'Filter learners' });
    expect(group.className).toBe('g-filter-bar');
    expect(screen.getByRole('textbox', { name: 'Search learners' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the count in a live region', () => {
    render(<Bar count="3 of 4" />);
    expect(screen.getByRole('status').textContent).toBe('3 of 4');
  });

  it('shows Clear filters only while canClear, and calls onClear', () => {
    const onClear = vi.fn();
    const { rerender } = render(<Bar onClear={onClear} />);
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    rerender(<Bar onClear={onClear} canClear />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('needs onClear as well as canClear, and takes a clear label', () => {
    const { rerender } = render(<Bar canClear />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(
      <FilterBar label="Filter" canClear onClear={() => {}} clearLabel="Reset">
        <Input label="Search" hideLabel />
      </FilterBar>,
    );
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy();
  });

  it('has no axe violations, empty or full', async () => {
    const { container, rerender } = render(<Bar />);
    expect(await axeViolations(container)).toEqual([]);
    rerender(<Bar canClear onClear={() => {}} count="3 of 4" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

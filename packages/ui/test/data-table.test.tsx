import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable, Pagination, type DataTableColumn } from '../src';
import { axeViolations } from './axe';

interface Person {
  id: string;
  name: string;
  courses: number;
}
const people: Person[] = [
  { id: 'a', name: 'Asha Rao', courses: 3 },
  { id: 'b', name: 'Ben Iyer', courses: 1 },
  { id: 'c', name: 'Chitra Nair', courses: 0 },
];
const columns: DataTableColumn<Person>[] = [
  { id: 'name', header: 'Learner', cell: (p) => p.name },
  { id: 'courses', header: 'Courses', cell: (p) => p.courses, align: 'end' },
];

function Harness({
  initial = [] as string[],
  onRowClick,
}: {
  initial?: string[];
  onRowClick?: (p: Person) => void;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <DataTable
      caption="Learners"
      columns={columns}
      rows={people}
      rowKey={(p) => p.id}
      selectable
      selected={selected}
      onSelectionChange={setSelected}
      rowLabel={(p) => p.name}
      onRowClick={onRowClick}
    />
  );
}
const header = () =>
  screen.getByRole('checkbox', { name: 'Select all rows on this page' }) as HTMLInputElement;

describe('DataTable', () => {
  it('renders a captioned table with headers, cells and alignment', () => {
    render(<DataTable caption="Learners" columns={columns} rows={people} rowKey={(p) => p.id} />);
    const table = screen.getByRole('table', { name: 'Learners' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['Learner', 'Courses']);
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(screen.getByText('3').className).toContain('g-table__end');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[aria-selected]')).toBeNull();
  });

  it('shows the empty slot and no footer when there are no rows', () => {
    render(
      <DataTable
        caption="Learners"
        columns={columns}
        rows={[]}
        rowKey={(p: Person) => p.id}
        selectable
        empty={<p>No learners yet</p>}
      />,
    );
    expect(screen.getByText('No learners yet')).toBeTruthy();
    expect(header().disabled).toBe(true);
    expect(document.querySelector('.g-table__footer')).toBeNull();
  });

  it('draws the footer and a sticky max height', () => {
    const { container } = render(
      <DataTable
        caption="L"
        columns={columns}
        rows={people}
        rowKey={(p) => p.id}
        footer={<p>Foot</p>}
        maxHeight="60vh"
      />,
    );
    expect(screen.getByText('Foot')).toBeTruthy();
    expect(
      (container.querySelector('.g-table__scroll') as HTMLElement).style.getPropertyValue(
        '--g-table-max-height',
      ),
    ).toBe('60vh');
  });

  it('selects one row with an accessible checkbox and tints it', () => {
    render(<Harness />);
    const box = screen.getByRole('checkbox', { name: 'Select Ben Iyer' }) as HTMLInputElement;
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(box.closest('tr')?.className).toContain('g-table__row--selected');
    expect(header().indeterminate).toBe(true);
    expect(header().checked).toBe(false);
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(header().indeterminate).toBe(false);
  });

  it('header checkbox selects every row on the page, then clears them, keeping other pages', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable
        caption="L"
        columns={columns}
        rows={people}
        rowKey={(p) => p.id}
        selectable
        selected={['z']}
        onSelectionChange={onChange}
        rowLabel={(p) => p.name}
      />,
    );
    fireEvent.click(header());
    expect(onChange).toHaveBeenLastCalledWith(['z', 'a', 'b', 'c']);
    rerender(
      <DataTable
        caption="L"
        columns={columns}
        rows={people}
        rowKey={(p) => p.id}
        selectable
        selected={['z', 'a', 'b', 'c']}
        onSelectionChange={onChange}
        rowLabel={(p) => p.name}
      />,
    );
    expect(header().checked).toBe(true);
    fireEvent.click(header());
    expect(onChange).toHaveBeenLastCalledWith(['z']);
  });

  it('falls back to the row key for a checkbox name and works without handlers', () => {
    render(
      <DataTable caption="L" columns={columns} rows={people} rowKey={(p) => p.id} selectable />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select a' }));
    fireEvent.click(header());
  });

  it('row click and Enter call onRowClick; the checkbox does not', () => {
    const onRowClick = vi.fn();
    render(<Harness onRowClick={onRowClick} />);
    const row = screen.getByText('Asha Rao').closest('tr') as HTMLElement;
    expect(row.tabIndex).toBe(0);
    fireEvent.click(screen.getByText('Asha Rao'));
    expect(onRowClick).toHaveBeenCalledWith(people[0]);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(row, { key: 'a' });
    fireEvent.keyDown(within(row).getByRole('checkbox'), { key: 'Enter' });
    fireEvent.click(within(row).getByRole('checkbox'));
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness initial={['a']} onRowClick={() => {}} />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Pagination', () => {
  it('shows the range and moves between pages', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={25} total={148} onPageChange={onPageChange} />);
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeTruthy();
    expect(screen.getByText('Showing 26–50 of 148')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });

  it('disables Previous on the first page and Next on the last, and clamps the last range', () => {
    const { rerender } = render(
      <Pagination page={1} pageSize={25} total={148} onPageChange={vi.fn()} />,
    );
    expect((screen.getByRole('button', { name: 'Previous' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    rerender(
      <Pagination
        page={6}
        pageSize={25}
        total={148}
        onPageChange={vi.fn()}
        label="Learners pages"
      />,
    );
    expect(screen.getByText('Showing 126–148 of 148')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('navigation', { name: 'Learners pages' })).toBeTruthy();
  });

  it('handles no rows and has no axe violations', async () => {
    const { container } = render(
      <Pagination page={1} pageSize={25} total={0} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText('Showing 0–0 of 0')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
    expect(await axeViolations(container)).toEqual([]);
  });
});

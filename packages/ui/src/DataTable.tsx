// A generic, typed data table: columns are definitions, rows are data. Selection is controlled by
// the caller (a list of row keys); the header checkbox selects or clears the rows on this page.

import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { cx } from './cx';
import './data-table.css';

export interface DataTableColumn<T> {
  /** Stable id, used as the React key. */
  id: string;
  /** Header content. */
  header: ReactNode;
  /** Renders the cell for one row. */
  cell: (row: T) => ReactNode;
  /** `end` right-aligns numbers. Default: `start`. */
  align?: 'start' | 'end';
  /** Draws this column's cells as row headers (`<th scope="row">`), usually the first column. */
  rowHeader?: boolean;
}

export interface DataTableProps<T> {
  /** Accessible name of the table, drawn as a visually hidden caption. */
  caption: string;
  columns: DataTableColumn<T>[];
  /** The rows on the current page. */
  rows: T[];
  /** A stable, unique key per row (an id, not an index). */
  rowKey: (row: T) => string;
  /** Adds a checkbox column. Needs `rowLabel`. */
  selectable?: boolean;
  /** Keys of the selected rows. Default: none. */
  selected?: string[];
  /** Called with the new list of selected keys. */
  onSelectionChange?: (keys: string[]) => void;
  /** Names a row's checkbox: "Select {rowLabel}". Use the person's name or the row's title. */
  rowLabel?: (row: T) => string;
  /** Makes rows clickable (mouse and Enter). Keep a real link or button in the row as well. */
  onRowClick?: ((row: T) => void) | undefined;
  /** Shown instead of the body when `rows` is empty (usually an EmptyState). */
  empty?: ReactNode;
  /** A footer under the table, usually `<Pagination />`. */
  footer?: ReactNode;
  /** Makes the table body scroll under a sticky header, for example `"60vh"`. */
  maxHeight?: string;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  selectable = false,
  selected = [],
  onSelectionChange,
  rowLabel,
  onRowClick,
  empty,
  footer,
  maxHeight,
}: DataTableProps<T>) {
  const keys = rows.map(rowKey);
  const chosen = keys.filter((k) => selected.includes(k));
  const all = keys.length > 0 && chosen.length === keys.length;
  const some = chosen.length > 0 && !all;

  const toggleAll = () => {
    const rest = selected.filter((k) => !keys.includes(k));
    onSelectionChange?.(all ? rest : [...rest, ...keys]);
  };
  const toggleRow = (key: string) =>
    onSelectionChange?.(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );

  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick?.(row);
  };

  const style = maxHeight ? ({ '--table-max-height': maxHeight } as CSSProperties) : undefined;

  return (
    <div className="g-table">
      <div className="g-table__scroll" style={style}>
        <table className="g-table__table">
          <caption className="g-table__sr">{caption}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" className="g-table__check">
                  <Checkbox
                    aria-label="Select all rows on this page"
                    checked={all}
                    indeterminate={some}
                    disabled={keys.length === 0}
                    onChange={toggleAll}
                  />
                </th>
              ) : null}
              {columns.map((c) => (
                <th key={c.id} scope="col" className={cx(c.align === 'end' && 'g-table__end')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.includes(key);
              const clickable = Boolean(onRowClick);
              return (
                <tr
                  key={key}
                  className={cx(
                    clickable && 'g-table__row--click',
                    isSelected && 'g-table__row--selected',
                  )}
                  aria-selected={selectable ? isSelected : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  onKeyDown={clickable ? (e) => onRowKeyDown(e, row) : undefined}
                >
                  {selectable ? (
                    <td className="g-table__check">
                      <Checkbox
                        aria-label={`Select ${rowLabel?.(row) ?? key}`}
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => {
                    const Cell = c.rowHeader ? 'th' : 'td';
                    return (
                      <Cell
                        key={c.id}
                        scope={c.rowHeader ? 'row' : undefined}
                        className={cx(c.align === 'end' && 'g-table__end')}
                      >
                        {c.cell(row)}
                      </Cell>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="g-table__empty">{empty}</div> : null}
      </div>
      {footer ? <div className="g-table__footer">{footer}</div> : null}
    </div>
  );
}

export interface PaginationProps {
  /** Current page, starting at 1. */
  page: number;
  pageSize: number;
  /** Rows across all pages. */
  total: number;
  onPageChange: (page: number) => void;
  /** Accessible name of the navigation. Default: "Pagination". */
  label?: string;
  /** The words on the two buttons, where "Next" would be confused with another Next on the page. */
  previousLabel?: string;
  nextLabel?: string;
}

/** "Showing 1–25 of 148" with Previous and Next. Pages are 1-based. */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  label = 'Pagination',
  previousLabel = 'Previous',
  nextLabel = 'Next',
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav className="g-pager" aria-label={label}>
      <p className="g-pager__text" aria-live="polite">
        Showing {from}–{to} of {total}
      </p>
      <div className="g-pager__actions">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          {previousLabel}
        </Button>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}

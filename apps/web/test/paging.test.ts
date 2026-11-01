import { describe, expect, it } from 'vitest';
import { pageFor } from '../src/paging';

const rows = Array.from({ length: 30 }, (_, i) => i);

describe('pageFor', () => {
  it('slices 25 rows a page', () => {
    expect(pageFor(rows, 1)).toEqual({ page: 1, rows: rows.slice(0, 25) });
    expect(pageFor(rows, 2)).toEqual({ page: 2, rows: rows.slice(25) });
  });

  it('falls back to the last page when the page is past the end, and to the first when below', () => {
    expect(pageFor(rows, 9).page).toBe(2);
    expect(pageFor(rows, 0).page).toBe(1);
    expect(pageFor([], 3)).toEqual({ page: 1, rows: [] });
  });

  it('takes another page size', () => {
    expect(pageFor(rows, 2, 12).rows).toHaveLength(12);
  });
});

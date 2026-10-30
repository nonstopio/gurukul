import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageSkeleton } from '../src/PageSkeleton';
import { axeViolations } from './axe';

describe('PageSkeleton', () => {
  it('is a busy status named "Loading", in a default-width page, with a header and three cards', async () => {
    const { container } = render(<PageSkeleton />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.textContent).toBe('Loading');
    expect(status.className).toBe('g-page g-page--default');
    expect(container.querySelectorAll('.g-page-skeleton__header .g-skeleton')).toHaveLength(3);
    expect(container.querySelectorAll(':scope .g-page > .g-skeleton--block')).toHaveLength(3);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('takes a width and a label', () => {
    render(<PageSkeleton width="reading" label="Loading the course" />);
    const status = screen.getByRole('status');
    expect(status.className).toBe('g-page g-page--reading');
    expect(status.textContent).toBe('Loading the course');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SUMMARY_LIMIT } from '../src/data/limits';
import { CourseLimitNotice } from '../src/learn/ui';

describe('CourseLimitNotice', () => {
  it('says nothing for a list that is whole', () => {
    const { container } = render(<CourseLimitNotice courses={[1, 2, 3]} />);
    expect(container.textContent).toBe('');
  });

  it('says so when a list reached the most it reads, so no course is left out silently', () => {
    render(<CourseLimitNotice courses={Array.from({ length: SUMMARY_LIMIT })} />);
    expect(screen.getByText('Not every course is listed')).toBeTruthy();
    expect(screen.getByText(/A list holds 1,000 courses at most/)).toBeTruthy();
  });
});

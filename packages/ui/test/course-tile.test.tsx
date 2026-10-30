import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CourseTile } from '../src';
import { axeViolations } from './axe';

const tile = (props: Partial<Parameters<typeof CourseTile>[0]> = {}) => (
  <CourseTile
    title="Git, the NonStop Way"
    theme="forest"
    heading={<a href="/courses/git">Git, the NonStop Way</a>}
    {...props}
  />
);

describe('CourseTile', () => {
  it('shows the picture when the course has one', () => {
    const { container } = render(tile({ image: 'https://example.com/cover.png' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/cover.png',
    );
    expect(container.querySelector('.g-course-tile__name')).toBeNull();
  });

  it('shows the course name on its own colour when there is no picture', () => {
    const { container } = render(tile({ theme: 'sand' }));
    expect(container.querySelector('img')).toBeNull();
    expect(
      container.querySelector('.g-course-tile__cover--sand .g-course-tile__name')?.textContent,
    ).toBe('Git, the NonStop Way');
  });

  it('falls back to the name when the picture fails, and tries a new picture', () => {
    const { container, rerender } = render(tile({ image: 'https://example.com/a.png' }));
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.g-course-tile__name')).toBeTruthy();
    rerender(tile({ image: 'https://example.com/b.png' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/b.png');
  });

  it('is one link, held by the title, with chips, summary, extra and meta around it', () => {
    render(
      tile({
        as: 'li',
        chips: <span>Foundation</span>,
        summary: 'Save your work.',
        extra: <span>64% done</span>,
        meta: '22 lessons',
      }),
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    for (const text of ['Foundation', 'Save your work.', '64% done', '22 lessons'])
      expect(screen.getByText(text)).toBeTruthy();
  });

  it('uses the plain title when no heading is given', () => {
    render(<CourseTile title="Plain" theme="sky" />);
    expect(screen.getByRole('heading', { name: 'Plain' })).toBeTruthy();
  });

  it('has no axe violations', async () => {
    const { container } = render(tile({ summary: 'x', meta: 'y' }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

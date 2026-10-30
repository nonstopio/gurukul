import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('is a choice when given onSelectedChange: a named checkbox that toggles', async () => {
    const onSelectedChange = vi.fn();
    const { container, rerender } = render(
      <CourseTile
        title="Git"
        theme="sand"
        selected={false}
        selectLabel="Choose Git"
        onSelectedChange={onSelectedChange}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Choose Git' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(container.querySelector('article')?.getAttribute('data-selected')).toBe('false');
    fireEvent.click(box);
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    rerender(<CourseTile title="Git" theme="sand" selected onSelectedChange={onSelectedChange} />);
    expect(container.querySelector('article')?.getAttribute('data-selected')).toBe('true');
    expect((screen.getByRole('checkbox', { name: 'Git' }) as HTMLInputElement).checked).toBe(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has no checkbox and no selection state when it is not a choice', () => {
    const { container } = render(tile());
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(container.querySelector('article')?.hasAttribute('data-selected')).toBe(false);
  });

  it('has no axe violations', async () => {
    const { container } = render(tile({ summary: 'x', meta: 'y' }));
    expect(await axeViolations(container)).toEqual([]);
  });
});

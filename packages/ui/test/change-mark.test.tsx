import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChangeMark, type ChangeMarkStatus } from '../src';
import { axeViolations } from './axe';

describe('ChangeMark', () => {
  it.each<[ChangeMarkStatus, string]>([
    ['added', 'Added'],
    ['changed', 'Changed'],
    ['moved', 'Moved'],
    ['removed', 'Removed'],
  ])('marks a block %s with a sign and a word, and names the group', async (status, word) => {
    const { container } = render(
      <ChangeMark statuses={[status]} what="Text block">
        <p>Rebase before you open a pull request.</p>
      </ChangeMark>,
    );
    const group = screen.getByRole('group', { name: `${status}: Text block` });
    expect(group.className).toBe(`g-change-mark g-change-mark--${status}`);
    const label = group.querySelector('.g-change-mark__label');
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    expect(label?.textContent).toBe(`${word} · Text block`);
    // The sign: an icon beside the word, never the colour alone.
    expect(label?.querySelector('svg')).not.toBeNull();
    expect(group.querySelector('.g-change-mark__body')?.textContent).toBe(
      'Rebase before you open a pull request.',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('names every status, with the first setting the tone', () => {
    render(<ChangeMark statuses={['changed', 'moved']} what="Code block" className="x" id="m" />);
    const group = screen.getByRole('group', { name: 'changed and moved: Code block' });
    expect(group.className).toBe('g-change-mark g-change-mark--changed x');
    expect(group.id).toBe('m');
    expect(group.textContent).toBe('Changed · Moved · Code block');
  });

  it('draws only the mark for something removed', () => {
    render(<ChangeMark statuses={['removed']} what="Image block" />);
    const group = screen.getByRole('group', { name: 'removed: Image block' });
    expect(group.querySelector('.g-change-mark__body')).toBeNull();
  });
});

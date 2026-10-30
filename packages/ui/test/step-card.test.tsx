import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepCard, Stepper, splitEmails } from '../src';
import { axeViolations } from './axe';

describe('splitEmails', () => {
  it('splits on commas, spaces, semicolons and newlines, lower-cases and drops empties', () => {
    expect(splitEmails(' A@x.com,b@x.com;\nC@x.com  d@x.com ,, ')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
    expect(splitEmails('')).toEqual([]);
  });
});

describe('StepCard', () => {
  it('is a section named by its numbered heading', () => {
    const { container } = render(
      <StepCard number={2} title="People">
        <p>Body</p>
      </StepCard>,
    );
    const section = screen.getByRole('region', { name: 'Step 2: People' });
    expect(within(section).getByRole('heading', { level: 2 }).textContent).toBe('Step 2: People');
    expect(container.querySelector('.g-step__badge')?.textContent).toBe('2');
    expect(within(section).getByText('Body')).toBeTruthy();
  });

  it('takes a heading level and is also available as Stepper.Step', async () => {
    const { container } = render(
      <Stepper.Step number={1} title="Courses" headingAs="h3">
        x
      </Stepper.Step>,
    );
    expect(screen.getByRole('heading', { level: 3 })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });
});

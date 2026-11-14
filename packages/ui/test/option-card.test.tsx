import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OptionCard, OptionCardGroup, OptionCardRow } from '../src';
import { axeViolations } from './axe';

describe('OptionCard', () => {
  it('is one button named by its call to action, described by its rows, that picks on click', async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <OptionCard title="Plain" cta="Select Plain" bodyId="rows" onSelect={onSelect}>
        <OptionCardGroup>People</OptionCardGroup>
        <OptionCardRow title="Learner" note="Takes courses" />
        <OptionCardRow title="Admin" />
      </OptionCard>,
    );
    const button = screen.getByRole('button', { name: 'Select Plain' });
    expect(button.getAttribute('aria-describedby')).toBe('rows');
    // Hidden separators keep terms and notes apart when read as one run.
    expect(document.getElementById('rows')?.textContent).toBe(
      'PeopleLearner, Takes courses. Admin. ',
    );
    expect(button.getAttribute('data-active')).toBe('false');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('previews on hover and focus, and spans the rows it is given', async () => {
    const onPreview = vi.fn();
    const { container } = render(
      <OptionCard
        title="Gurukul"
        cta="Select Gurukul"
        label="Pick Gurukul"
        active
        rows={4}
        className="x"
        onSelect={() => {}}
        onPreview={onPreview}
      >
        <OptionCardRow title="Shishya" note="A learner" />
      </OptionCard>,
    );
    const button = screen.getByRole('button', { name: 'Pick Gurukul' });
    expect(button.getAttribute('data-active')).toBe('true');
    expect(button.classList.contains('g-option--rows')).toBe(true);
    expect(button.style.getPropertyValue('--option-rows')).toBe('4');
    fireEvent.mouseEnter(button);
    fireEvent.mouseLeave(button);
    fireEvent.focus(button);
    fireEvent.blur(button);
    expect(onPreview.mock.calls).toEqual([[true], [false], [true], [false]]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('does not need a preview handler', () => {
    render(
      <OptionCard title="A" cta="Select A" onSelect={() => {}}>
        <OptionCardRow title="x" />
      </OptionCard>,
    );
    const button = screen.getByRole('button', { name: 'Select A' });
    fireEvent.mouseEnter(button);
    fireEvent.blur(button);
    expect(button.style.getPropertyValue('--option-rows')).toBe('');
  });
});

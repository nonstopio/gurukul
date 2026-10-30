import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToggleCard } from '../src';
import { axeViolations } from './axe';

describe('ToggleCard', () => {
  it('is a switch named by its title, with a description, and the whole card toggles it', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <ToggleCard
        title="Educator"
        description="Builds and edits courses."
        checked={false}
        onChange={onChange}
      />,
    );
    const sw = screen.getByRole('switch', { name: 'Educator' }) as HTMLInputElement;
    expect(sw.getAttribute('aria-describedby')).toBeTruthy();
    expect(sw.getAttribute('aria-labelledby')).toBeTruthy();
    expect(sw.checked).toBe(false);
    expect(screen.getByText('Builds and edits courses.')).toBeTruthy();
    fireEvent.click(screen.getByText('Educator'));
    expect(onChange).toHaveBeenCalledOnce();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('works without a description, takes a class and can be disabled', () => {
    const { container } = render(
      <ToggleCard title="Admin" className="x" checked disabled onChange={() => {}} />,
    );
    expect(container.querySelector('.g-togglecard__desc')).toBeNull();
    expect(container.firstElementChild?.className).toBe('g-togglecard x');
    expect((screen.getByRole('switch', { name: 'Admin' }) as HTMLInputElement).disabled).toBe(true);
  });
});

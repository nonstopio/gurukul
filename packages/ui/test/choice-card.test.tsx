import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChoiceCard, UsersIcon } from '../src';
import { axeViolations } from './axe';

describe('ChoiceCard', () => {
  it('is a whole-card checkbox named by its title, with icon and meta', async () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <ul>
        <ChoiceCard
          icon={<UsersIcon />}
          title="Platform"
          meta="12 members"
          selected={false}
          onSelectedChange={onSelectedChange}
        />
      </ul>,
    );
    const box = screen.getByRole('checkbox', { name: 'Platform' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(screen.getByText('12 members')).toBeTruthy();
    expect(container.querySelector('li')?.getAttribute('data-selected')).toBe('false');
    fireEvent.click(screen.getByText('Platform'));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows the chosen state, a custom name, no meta and a different element', () => {
    const { container } = render(
      <ChoiceCard
        as="div"
        icon={<UsersIcon />}
        title="QA"
        selectLabel="Pick the QA team"
        className="x"
        selected
        onSelectedChange={() => {}}
      />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.tagName).toBe('DIV');
    expect(root.className).toBe('g-choice x');
    expect(root.getAttribute('data-selected')).toBe('true');
    expect(
      (screen.getByRole('checkbox', { name: 'Pick the QA team' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(container.querySelector('.g-choice__meta')).toBeNull();
  });
});

describe('ChoiceCard: disabled', () => {
  it('cannot be picked when disabled, and says so', async () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <ChoiceCard
        as="div"
        icon={<UsersIcon />}
        title="Mobile"
        selected={false}
        disabled
        onSelectedChange={onSelectedChange}
      />,
    );
    const box = screen.getByRole('checkbox', { name: 'Mobile' }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(container.firstElementChild?.className).toContain('g-choice--disabled');
    await userEvent.click(box);
    expect(onSelectedChange).not.toHaveBeenCalled();
  });
});

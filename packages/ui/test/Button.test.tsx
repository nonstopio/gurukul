import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, buttonClass } from '../src';
import { axeViolations } from './axe';

describe('Button', () => {
  it('is a type="button" primary button by default', () => {
    render(<Button>Resume lesson</Button>);
    const button = screen.getByRole('button', { name: 'Resume lesson' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toBe('g-btn g-btn--primary');
  });

  it('applies the variant, extra classes and passes props through', () => {
    render(
      <Button variant="secondary" className="wide" type="submit" disabled>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.className).toBe('g-btn g-btn--secondary wide');
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('hides a leading icon from assistive tech', () => {
    render(<Button icon={<svg data-testid="icon" />}>Assign</Button>);
    const icon = screen.getByTestId('icon');
    expect(icon.parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Assign' })).toBeTruthy();
  });

  it('renders no icon wrapper without an icon', () => {
    const { container } = render(<Button variant="ghost">Skip</Button>);
    expect(container.querySelector('.g-btn__icon')).toBeNull();
  });
});

describe('Button loading', () => {
  it('disables, marks busy, keeps the label and swaps the icon for a spinner', () => {
    const { container } = render(
      <Button loading icon={<svg data-testid="icon" />}>
        Save settings
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save settings' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('icon')).toBeNull();
    expect(container.querySelector('.g-btn__spinner')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is not busy by default and honours disabled on its own', () => {
    render(<Button disabled>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.hasAttribute('aria-busy')).toBe(false);
  });
});

describe('Button size and variants', () => {
  it('sm adds the dense class', () => {
    render(
      <Button size="sm" variant="danger">
        Remove
      </Button>,
    );
    expect(screen.getByRole('button').className).toBe('g-btn g-btn--danger g-btn--sm');
  });

  it('chrome-secondary is a class of its own', () => {
    render(<Button variant="chrome-secondary">Preview</Button>);
    expect(screen.getByRole('button').className).toBe('g-btn g-btn--chrome-secondary');
  });
});

describe('buttonClass', () => {
  it('defaults to primary with no extra class', () => {
    expect(buttonClass()).toBe('g-btn g-btn--primary');
  });

  it('lets links borrow the button look', () => {
    expect(buttonClass('chrome', 'full')).toBe('g-btn g-btn--chrome full');
  });

  it('takes an optional size', () => {
    expect(buttonClass('secondary', undefined, 'sm')).toBe('g-btn g-btn--secondary g-btn--sm');
  });
});

describe('Button accessibility', () => {
  it('has no axe violations in any variant, with and without an icon', async () => {
    const { container } = render(
      <>
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost" icon={<svg />}>
          Ghost
        </Button>
        <Button variant="chrome" disabled>
          Chrome
        </Button>
        <Button variant="danger">Delete course</Button>
        <Button variant="chrome-secondary">Preview</Button>
        <Button size="sm" variant="secondary">
          Small
        </Button>
        <Button loading icon={<svg />}>
          Saving
        </Button>
      </>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('the axe helper', () => {
  it('does report a real violation, so a clean result means something', async () => {
    const { container } = render(<button type="button" />);
    expect(await axeViolations(container)).toEqual([expect.stringMatching(/^button-name/)]);
  });
});

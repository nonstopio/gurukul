import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('keeps the icon and the spinner direct children, which the icon-side padding rule selects', () => {
    const { container } = render(
      <>
        <Button icon={<svg />}>Add</Button>
        <Button loading>Saving</Button>
      </>,
    );
    expect(container.querySelector('.g-btn > .g-btn__icon')).not.toBeNull();
    expect(container.querySelector('.g-btn > .g-btn__spinner')).not.toBeNull();
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

  it('quiet is a class of its own', () => {
    render(<Button variant="quiet">Rename</Button>);
    expect(screen.getByRole('button').className).toBe('g-btn g-btn--quiet');
  });

  it('danger-quiet is a class of its own', () => {
    render(<Button variant="danger-quiet">Delete</Button>);
    expect(screen.getByRole('button').className).toBe('g-btn g-btn--danger-quiet');
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
        <Button variant="quiet">Rename</Button>
        <Button variant="danger-quiet">Delete</Button>
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

  it('draws a filled button that cannot be pressed on a neutral ground, not a dimmed accent', () => {
    const style = document.createElement('style');
    // jsdom resolves no var(): each fill this asks about gets a colour of its own.
    style.textContent = readFileSync(resolve(import.meta.dirname, '../src/button.css'), 'utf8')
      .replaceAll('var(--accent)', 'rgb(70, 211, 155)')
      .replaceAll('var(--danger)', 'rgb(255, 143, 134)')
      .replaceAll('var(--surface-hover)', 'rgb(28, 41, 35)')
      .replaceAll('var(--border)', 'rgb(214, 219, 210)');
    document.head.append(style);
    try {
      render(
        <>
          <Button>Ready</Button>
          <Button disabled>Waiting</Button>
          <Button loading>Saving</Button>
          <Button variant="danger" disabled>
            Delete
          </Button>
          <Button variant="secondary" disabled>
            Cancel
          </Button>
        </>,
      );
      const look = (name: string) => getComputedStyle(screen.getByRole('button', { name }));
      expect(look('Ready').backgroundColor).toBe('rgb(70, 211, 155)');
      // Half an accent is still a bright green in the dark theme: it read as the one to press.
      expect(look('Waiting').backgroundColor).toBe('rgb(28, 41, 35)');
      expect(look('Waiting').opacity).toBe('1');
      expect(look('Delete').backgroundColor).toBe('rgb(28, 41, 35)');
      // Its edge keeps the button's shape where the ground is near the page's (the light theme).
      expect(look('Waiting').borderColor).toBe('rgb(214, 219, 210)');
      expect(look('Delete').borderColor).toBe('rgb(214, 219, 210)');
      // Waiting on its own click keeps its colour; other variants keep the dimming.
      expect(look('Saving').backgroundColor).toBe('rgb(70, 211, 155)');
      expect(look('Cancel').opacity).toBe('0.5');
    } finally {
      style.remove();
    }
  });
});

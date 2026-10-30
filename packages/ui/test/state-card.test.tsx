import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StateCard, type StateCardVariant } from '../src';
import { axeViolations } from './axe';

describe('StateCard', () => {
  it('announces an error at once, with its code and kind', () => {
    render(
      <StateCard
        variant="error"
        title="We could not load this course"
        code="NET-TIMEOUT"
        kind="Network"
        actions={<button type="button">Try again</button>}
      >
        The server did not answer in time.
      </StateCard>,
    );
    const alert = screen.getByRole('alert');
    expect(alert.className).toContain('g-state--error');
    expect(screen.getByRole('heading', { name: 'We could not load this course' })).toBeTruthy();
    expect(alert.querySelector('code')?.textContent).toBe('NET-TIMEOUT · Network');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('offline is a polite status; forbidden has no live role', () => {
    const { rerender } = render(
      <StateCard variant="offline" title="You are offline" headingAs="h2" />,
    );
    expect(screen.getByRole('status').className).toContain('g-state--offline');
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    rerender(<StateCard variant="forbidden" title="This is for Educators" code="AUTH-FORBIDDEN" />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('code')?.textContent).toBe('AUTH-FORBIDDEN');
  });

  it('leaves out the message, code and actions when not given', () => {
    const { container } = render(<StateCard variant="forbidden" title="No access" />);
    expect(container.querySelector('.g-state__text')).toBeNull();
    expect(container.querySelector('.g-state__code')).toBeNull();
    expect(container.querySelector('.g-state__actions')).toBeNull();
  });

  it.each<StateCardVariant>(['error', 'offline', 'forbidden'])(
    'has no axe violations as %s',
    async (variant) => {
      const { container } = render(
        <StateCard
          variant={variant}
          title="Title"
          code="X-1"
          kind="Kind"
          actions={<button type="button">Go</button>}
        >
          Message
        </StateCard>,
      );
      expect(await axeViolations(container)).toEqual([]);
    },
  );
});

import { fireEvent, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { RouteErrorPage } from '../src/RouteErrorPage';
import { AnalyticsProvider } from '../src/analytics/react/AnalyticsProvider';
import { createMockAnalytics } from './analytics-mock';

afterEach(() => vi.unstubAllGlobals());

function crash(error: unknown) {
  const Boom = () => {
    throw error;
  };
  return createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteErrorPage /> }]);
}

it('shows a plain message, counts the crash by error name and offers Reload', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { analytics } = createMockAnalytics();
  const reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
  render(
    <AnalyticsProvider analytics={analytics}>
      <RouterProvider router={crash(new TypeError('secret detail'))} />
    </AnalyticsProvider>,
  );
  expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeTruthy();
  expect(analytics.track).toHaveBeenCalledWith('app_error', { source: 'route', code: 'TypeError' });
  expect(JSON.stringify(analytics.track.mock.calls)).not.toContain('secret');
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(reload).toHaveBeenCalled();
});

it('names a thrown non-error Unknown', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const { analytics } = createMockAnalytics();
  render(
    <AnalyticsProvider analytics={analytics}>
      <RouterProvider router={crash('a string')} />
    </AnalyticsProvider>,
  );
  expect(analytics.track).toHaveBeenCalledWith('app_error', { source: 'route', code: 'Unknown' });
});

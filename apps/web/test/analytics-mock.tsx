import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { ReactNode } from 'react';
import { AnalyticsContext } from '../src/analytics/react/context';
import { CONSENT_GRANTED } from '../src/analytics/core/types';
import type { Analytics } from '../src/analytics';

type MockAnalytics = Analytics & { [K in keyof Analytics]: Mock };

/**
 * A stand-in for the analytics facade that records calls, for feature tests:
 *
 *   const { analytics, wrapper } = createMockAnalytics();
 *   render(<Thing />, { wrapper });
 *   expect(analytics.track).toHaveBeenCalledWith('course_start', { course_id: 'git' });
 *
 * Consent reads as granted, so components that wait for it behave as for a signed-in person.
 */
export function createMockAnalytics() {
  const analytics = {
    init: vi.fn(),
    track: vi.fn(),
    pageView: vi.fn(),
    identify: vi.fn(),
    setUserProperties: vi.fn(),
    setContext: vi.fn(),
    setConsent: vi.fn(),
    getConsent: vi.fn(() => CONSENT_GRANTED),
    subscribe: vi.fn(() => () => {}),
    setEnabled: vi.fn(),
    reset: vi.fn(),
    configure: vi.fn(),
  } as unknown as MockAnalytics;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>
  );
  return { analytics, wrapper };
}

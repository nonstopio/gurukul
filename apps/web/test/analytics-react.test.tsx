import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnalytics } from '../src/analytics/core/analytics';
import { CONSENT_DENIED, CONSENT_GRANTED } from '../src/analytics/core/types';
import type { AnalyticsProvider } from '../src/analytics/core/types';
import { AnalyticsProvider as Provider } from '../src/analytics/react/AnalyticsProvider';
import {
  AnalyticsSession,
  markSignInStarted,
  topRole,
} from '../src/analytics/react/AnalyticsSession';
import { useAnalytics, useConsent } from '../src/analytics/react/context';
import { TrackClick, TrackImpression, useTrackOnMount } from '../src/analytics/react/Track';
import { AuthProvider } from '../src/auth/AuthProvider';
import { acceptPolicy } from '../src/privacy/policy';
import { createMockAnalytics } from './analytics-mock';
import { NONSTOP, fakeAuth } from './fake-auth';

afterEach(() => vi.unstubAllGlobals());

function tracked() {
  const { analytics, wrapper } = createMockAnalytics();
  return { analytics, wrapper };
}

function app(initial: string, loader?: () => Promise<null>) {
  return createMemoryRouter(
    [
      { path: '/', element: <p>home</p> },
      { path: '/a', element: <p>a</p>, ...(loader ? { loader } : {}) },
      { path: '/b', element: <p>b</p> },
    ],
    { initialEntries: [initial] },
  );
}

describe('page views', () => {
  it('sends exactly one page_view per navigation, once under StrictMode', async () => {
    const { analytics } = tracked();
    document.title = 'Home · Gurukul';
    const router = app('/');
    render(
      <StrictMode>
        <Provider analytics={analytics} router={router}>
          <RouterProvider router={router} />
        </Provider>
      </StrictMode>,
    );
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(1));
    expect(analytics.pageView).toHaveBeenCalledWith({
      page_path: '/',
      page_title: 'Home · Gurukul',
      page_location: `${window.location.origin}/`,
    });
    await act(() => router.navigate('/a'));
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(2));
    await act(() => router.navigate('/a?x=1'));
    await act(() => router.navigate('/a'));
    await new Promise((r) => setTimeout(r, 20));
    expect(analytics.pageView).toHaveBeenCalledTimes(2);
    expect(analytics.init).toHaveBeenCalled();
  });
  it('counts a changed query string as a new page only when asked to', async () => {
    const { analytics } = tracked();
    const router = app('/a');
    render(
      <Provider analytics={analytics} router={router} includeQuery>
        <RouterProvider router={router} />
      </Provider>,
    );
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(1));
    await act(() => router.navigate('/a?x=1'));
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(2));
    expect(analytics.pageView).toHaveBeenLastCalledWith(
      expect.objectContaining({ page_path: '/a?x=1' }),
    );
  });
  it('waits for a loading navigation to settle', async () => {
    const { analytics } = tracked();
    let release: () => void = () => {};
    const router = app('/', () => new Promise((r) => (release = () => r(null))));
    render(
      <Provider analytics={analytics} router={router}>
        <RouterProvider router={router} />
      </Provider>,
    );
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(1));
    void act(() => void router.navigate('/a'));
    await new Promise((r) => setTimeout(r, 20));
    expect(analytics.pageView).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(analytics.pageView).toHaveBeenCalledTimes(2));
  });
  it('counts nothing until consent, then the page the person is on', async () => {
    const sent: string[] = [];
    const provider: AnalyticsProvider = {
      init: () => Promise.resolve(),
      track: () => {},
      pageView: (p) => void sent.push(String(p.page_path)),
      identify: () => {},
      setUserProperties: () => {},
      setConsent: () => {},
      setEnabled: () => {},
      reset: () => {},
    };
    const real = createAnalytics({ providers: [provider] });
    const router = app('/a');
    render(
      <Provider analytics={real} router={router}>
        <RouterProvider router={router} />
      </Provider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(sent).toEqual([]);
    act(() => real.setConsent(CONSENT_GRANTED));
    await waitFor(() => expect(sent).toEqual(['/a']));
  });
  it('counts the same page again for the next visit after consent was withdrawn', async () => {
    const sent: string[] = [];
    const provider: AnalyticsProvider = {
      init: () => Promise.resolve(),
      track: () => {},
      pageView: (p) => void sent.push(String(p.page_path)),
      identify: () => {},
      setUserProperties: () => {},
      setConsent: () => {},
      setEnabled: () => {},
      reset: () => {},
    };
    const real = createAnalytics({ providers: [provider] });
    const router = app('/a');
    render(
      <Provider analytics={real} router={router}>
        <RouterProvider router={router} />
      </Provider>,
    );
    act(() => real.setConsent(CONSENT_GRANTED));
    await waitFor(() => expect(sent).toEqual(['/a']));
    act(() => real.setConsent(CONSENT_DENIED));
    act(() => real.setConsent(CONSENT_GRANTED));
    await waitFor(() => expect(sent).toEqual(['/a', '/a']));
  });
  it('mounts without a router', () => {
    const { analytics } = tracked();
    render(
      <Provider analytics={analytics}>
        <p>hi</p>
      </Provider>,
    );
    expect(screen.getByText('hi')).toBeTruthy();
  });
});

describe('hooks and wrappers', () => {
  it('useAnalytics and useConsent read the provided instance', () => {
    const { analytics, wrapper } = tracked();
    function Probe() {
      const a = useAnalytics();
      return <p>{String(a === analytics) + useConsent()}</p>;
    }
    render(<Probe />, { wrapper });
    expect(screen.getByText('truegranted')).toBeTruthy();
  });
  it('TrackClick tracks, then runs the child onClick unchanged', () => {
    const { analytics, wrapper } = tracked();
    const onClick = vi.fn();
    render(
      <>
        <TrackClick event="select_content" params={{ content_type: 'cta', content_id: 'x' }}>
          <button onClick={onClick}>go</button>
        </TrackClick>
        <TrackClick event="logout">
          <button>bye</button>
        </TrackClick>
      </>,
      { wrapper },
    );
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('bye'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('select_content', {
      content_type: 'cta',
      content_id: 'x',
    });
    expect(analytics.track).toHaveBeenCalledWith('logout');
  });
  it('useTrackOnMount does not send again when its event changes', () => {
    const { analytics, wrapper } = tracked();
    function Screen({ event }: { event: 'logout' | 'course_start' }) {
      useTrackOnMount(event as 'logout');
      return null;
    }
    const view = render(<Screen event="logout" />, { wrapper });
    view.rerender(<Screen event="course_start" />);
    expect(analytics.track).toHaveBeenCalledTimes(1);
  });
  it('useTrackOnMount sends once, even under StrictMode and a re-render', () => {
    const { analytics, wrapper } = tracked();
    function Screen({ n }: { n: number }) {
      useTrackOnMount('course_start', { course_id: `c${n}` });
      return null;
    }
    const view = render(
      <StrictMode>
        <Screen n={1} />
      </StrictMode>,
      { wrapper },
    );
    view.rerender(
      <StrictMode>
        <Screen n={2} />
      </StrictMode>,
    );
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('course_start', { course_id: 'c1' });
  });
});

describe('TrackImpression', () => {
  function stubObserver() {
    const seen: { cb: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = [];
    const disconnect = vi.fn();
    class Fake {
      constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        seen.push({ cb, ...(options ? { options } : {}) });
      }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', Fake);
    const fire = (isIntersecting: boolean) =>
      act(() =>
        seen[0]?.cb([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver),
      );
    return { seen, fire, disconnect };
  }
  it('sends once, the first time the element is on screen', () => {
    const { analytics, wrapper } = tracked();
    const { seen, fire, disconnect } = stubObserver();
    render(
      <TrackImpression event="certificate_view" params={{ certificate_id: 'c1' }} threshold={0.8}>
        <p>card</p>
      </TrackImpression>,
      { wrapper },
    );
    expect(seen[0]?.options).toEqual({ threshold: 0.8 });
    fire(false);
    expect(analytics.track).not.toHaveBeenCalled();
    fire(true);
    fire(true);
    expect(analytics.track).toHaveBeenCalledTimes(1);
    expect(analytics.track).toHaveBeenCalledWith('certificate_view', { certificate_id: 'c1' });
    expect(disconnect).toHaveBeenCalled();
  });
  it('defaults to half visible, accepts no params, and survives a browser without the API', () => {
    const { analytics, wrapper } = tracked();
    const { seen, fire } = stubObserver();
    render(
      <TrackImpression event="logout">
        <p>x</p>
      </TrackImpression>,
      { wrapper },
    );
    expect(seen[0]?.options).toEqual({ threshold: 0.5 });
    fire(true);
    expect(analytics.track).toHaveBeenCalledWith('logout');
    vi.stubGlobal('IntersectionObserver', undefined);
    render(
      <TrackImpression event="logout">
        <p>y</p>
      </TrackImpression>,
      { wrapper },
    );
    expect(screen.getByText('y')).toBeTruthy();
  });
});

describe('AnalyticsSession', () => {
  function setup() {
    const { analytics } = tracked();
    const f = fakeAuth({ admin: true });
    render(
      <Provider analytics={analytics}>
        <AuthProvider service={f.service}>
          <AnalyticsSession />
        </AuthProvider>
      </Provider>,
    );
    const signIn = async (firstSignIn?: boolean) => {
      await act(async () => {
        f.emitUser({ ...NONSTOP, ...(firstSignIn === undefined ? {} : { firstSignIn }) });
        await Promise.resolve();
      });
      act(() => f.emitProfile({ roles: ['learner'], displayName: 'P', team: null }));
      await act(async () => {
        await Promise.resolve();
      });
    };
    return { analytics, f, signIn };
  }
  it('denies consent while signed out', () => {
    const { analytics } = setup();
    expect(analytics.setConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics_storage: 'denied' }),
    );
    expect(analytics.identify).not.toHaveBeenCalled();
  });
  it('grants consent, identifies by uid with the role, and sends login after a sign-in', async () => {
    markSignInStarted();
    const { analytics, signIn } = setup();
    await signIn();
    expect(analytics.setConsent).toHaveBeenLastCalledWith(CONSENT_GRANTED);
    expect(analytics.identify).toHaveBeenCalledWith('u1');
    expect(analytics.setContext).toHaveBeenCalledWith({ user_role: 'admin' });
    expect(analytics.setUserProperties).toHaveBeenCalledWith({ role: 'admin' });
    expect(analytics.track).toHaveBeenCalledWith('login', { method: 'google' });
    expect(analytics.track).not.toHaveBeenCalledWith('sign_up', expect.anything());
  });
  it('also sends sign_up on a first sign-in', async () => {
    markSignInStarted();
    const { analytics, signIn } = setup();
    await signIn(true);
    expect(analytics.track).toHaveBeenCalledWith('sign_up', { method: 'google' });
  });
  it('sends no login for a session that was already open', async () => {
    const { analytics, signIn } = setup();
    await signIn();
    expect(analytics.track).not.toHaveBeenCalled();
    expect(analytics.identify).toHaveBeenCalledWith('u1');
  });
  it('resets and denies consent on sign-out', async () => {
    const { analytics, f, signIn } = setup();
    await signIn();
    await act(async () => {
      f.emitUser(null);
      await Promise.resolve();
    });
    expect(analytics.reset).toHaveBeenCalledTimes(1);
    expect(analytics.setConsent).toHaveBeenLastCalledWith(
      expect.objectContaining({ analytics_storage: 'denied' }),
    );
  });
  it('waits for the policy to be accepted', async () => {
    localStorage.clear();
    const { analytics, signIn } = setup();
    await signIn();
    expect(analytics.identify).not.toHaveBeenCalled();
    act(() => acceptPolicy());
    expect(analytics.identify).toHaveBeenCalledWith('u1');
  });
  it('survives storage that throws', async () => {
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('blocked');
      },
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    });
    expect(() => markSignInStarted()).not.toThrow();
    const { analytics, signIn } = setup();
    await signIn();
    expect(analytics.track).not.toHaveBeenCalled();
  });
  it('picks the most privileged role', () => {
    expect(topRole(['learner'])).toBe('learner');
    expect(topRole(['learner', 'educator'])).toBe('educator');
    expect(topRole(['learner', 'manager'])).toBe('manager');
    expect(topRole(['manager', 'educator'])).toBe('educator');
    expect(topRole(['educator', 'admin'])).toBe('admin');
  });
});

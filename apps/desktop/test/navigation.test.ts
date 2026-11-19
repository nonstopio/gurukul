import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../src/log';
import {
  allowPermission,
  decideNavigation,
  guardContents,
  isExternalUrl,
  type ContentsLike,
} from '../src/navigation';

const ORIGINS = ['https://gurukul.nonstopio.com'];

function setup(openExternal = vi.fn(async () => undefined)) {
  const listeners = new Map<string, (event: never) => void>();
  let openHandler: (details: { url: string }) => { action: 'deny' } = () => ({ action: 'deny' });
  const contents = {
    on: (name: string, listener: (event: never) => void) => listeners.set(name, listener),
    setWindowOpenHandler: (handler: typeof openHandler) => {
      openHandler = handler;
    },
  } as unknown as ContentsLike;
  const sink = vi.fn();
  guardContents(contents, ORIGINS, { openExternal }, createLogger({ sink }));
  const fire = (name: string, url?: string) => {
    const event = { url, preventDefault: vi.fn() };
    (listeners.get(name) as (event: unknown) => void)(event);
    return event;
  };
  return { fire, open: (url: string) => openHandler({ url }), openExternal, sink };
}

describe('isExternalUrl', () => {
  it('opens only web and mail links outside', () => {
    expect(isExternalUrl('https://github.com/nonstopio')).toBe(true);
    expect(isExternalUrl('http://example.com')).toBe(true);
    expect(isExternalUrl('mailto:gurukul@example.com')).toBe(true);
    expect(isExternalUrl('file:///etc/passwd')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isExternalUrl('ms-settings:privacy')).toBe(false);
    expect(isExternalUrl('nonsense')).toBe(false);
  });
});

describe('decideNavigation', () => {
  it('stays on Gurukul, sends web links outside and blocks the rest', () => {
    expect(decideNavigation('https://gurukul.nonstopio.com/studio', ORIGINS)).toBe('stay');
    expect(decideNavigation('https://github.com/', ORIGINS)).toBe('external');
    expect(decideNavigation('file:///C:/Windows', ORIGINS)).toBe('block');
  });
});

describe('guardContents', () => {
  it('lets the window move around Gurukul', () => {
    const { fire, openExternal } = setup();
    const event = fire('will-navigate', 'https://gurukul.nonstopio.com/courses');
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens a link to another site in the system browser instead', () => {
    const { fire, openExternal } = setup();
    const event = fire('will-navigate', 'https://github.com/nonstopio/gurukul');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/nonstopio/gurukul');
  });

  it('blocks a navigation to a local file without opening anything', () => {
    const { fire, openExternal, sink } = setup();
    const event = fire('will-navigate', 'file:///etc/passwd');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Navigation blocked', { reason: 'scheme' });
  });

  it('stops a redirect away from Gurukul and allows one within it', () => {
    const { fire, openExternal } = setup();
    expect(
      fire('will-redirect', 'https://gurukul.nonstopio.com/x').preventDefault,
    ).not.toHaveBeenCalled();
    expect(fire('will-redirect', 'https://evil.example/').preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('never opens a second window: web links go to the system browser', () => {
    const { open, openExternal, sink } = setup();
    expect(open('https://gurukul.nonstopio.com/certificates/1')).toEqual({ action: 'deny' });
    expect(open('https://youtube.com/watch?v=1')).toEqual({ action: 'deny' });
    expect(open('file:///etc/passwd')).toEqual({ action: 'deny' });
    expect(openExternal.mock.calls).toEqual([
      ['https://gurukul.nonstopio.com/certificates/1'],
      ['https://youtube.com/watch?v=1'],
    ]);
    expect(sink).toHaveBeenCalledWith('warn', 'Link not opened', { reason: 'scheme' });
  });

  it('logs when the system browser cannot be opened', async () => {
    const { open, sink } = setup(vi.fn(async () => Promise.reject(new Error('no browser'))));
    open('https://github.com/');
    await vi.waitFor(() =>
      expect(sink).toHaveBeenCalledWith('error', 'Link not opened', { error: { name: 'Error' } }),
    );
  });

  it('refuses <webview>', () => {
    const { fire, sink } = setup();
    expect(fire('will-attach-webview').preventDefault).toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Navigation blocked', { reason: 'webview' });
  });
});

describe('allowPermission', () => {
  it('allows full screen anywhere and clipboard writes from Gurukul only', () => {
    expect(allowPermission('fullscreen', 'https://www.youtube.com', ORIGINS)).toBe(true);
    expect(
      allowPermission('clipboard-sanitized-write', 'https://gurukul.nonstopio.com/', ORIGINS),
    ).toBe(true);
    expect(allowPermission('clipboard-sanitized-write', 'https://evil.example/', ORIGINS)).toBe(
      false,
    );
  });

  it('refuses everything else', () => {
    for (const p of ['media', 'geolocation', 'notifications', 'clipboard-read', 'openExternal']) {
      expect(allowPermission(p, 'https://gurukul.nonstopio.com/', ORIGINS)).toBe(false);
    }
  });
});

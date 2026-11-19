import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { clientDefines, googleClient } from '../src/googleClient';
import {
  AUTH_URL,
  TOKEN_URL,
  authUrl,
  createGoogleSignIn,
  page,
  pkce,
  type FetchLike,
  type GoogleSignInDeps,
} from '../src/googleSignIn';
import { createLogger } from '../src/log';

// No test here talks to Google: the token endpoint is a fake, and "the browser" is this test
// calling the loopback listener the way Google's redirect would.

const ID_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';
const CLIENT = { id: 'desktop-client.apps.example', secret: 'not-a-real-secret' };

type FetchInit = Parameters<FetchLike>[1];

function tokenAnswer(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function setup(overrides: Partial<GoogleSignInDeps> = {}) {
  const sink = vi.fn();
  const opened: URL[] = [];
  const fetch = vi.fn<FetchLike>(async () => tokenAnswer(200, { id_token: ID_TOKEN }));
  const onSettled = vi.fn();
  const deps: GoogleSignInDeps = {
    client: CLIENT,
    openExternal: vi.fn(async (url: string) => {
      opened.push(new URL(url));
    }),
    fetch,
    log: createLogger({ sink }),
    onSettled,
    ...overrides,
  };
  const signIn = createGoogleSignIn(deps);
  /** The consent page the n-th sign-in opened, once it has. */
  const consent = async (n = 0) => {
    await vi.waitFor(() => expect(opened[n]).toBeDefined());
    return opened[n] as URL;
  };
  /** Google's redirect back to the listener, with these parameters. */
  const redirect = async (url: URL, params: Record<string, string>, init?: RequestInit) => {
    const back = new URL(String(url.searchParams.get('redirect_uri')));
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, v);
    const res = await globalThis.fetch(back, init);
    return { status: res.status, text: await res.text() };
  };
  const state = (url: URL) => String(url.searchParams.get('state'));
  return { signIn, deps, sink, fetch, onSettled, opened, consent, redirect, state };
}

/** Every value the logger saw, as one string: tokens, codes and secrets must not be in it. */
const logged = (sink: ReturnType<typeof vi.fn>) => JSON.stringify(sink.mock.calls);

describe('googleClient', () => {
  it('is null without an id, and keeps the secret only when there is one', () => {
    expect(googleClient(undefined, 'x')).toBeNull();
    expect(googleClient('  ', 'x')).toBeNull();
    expect(googleClient(' id ', undefined)).toEqual({ id: 'id', secret: null });
    expect(googleClient('id', ' ')).toEqual({ id: 'id', secret: null });
    expect(googleClient('id', ' s ')).toEqual({ id: 'id', secret: 's' });
  });

  it('turns the build’s variables into string literals for esbuild, empty when unset', () => {
    expect(clientDefines({ GURUKUL_DESKTOP_GOOGLE_CLIENT_ID: 'id' })).toEqual({
      'process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_ID': '"id"',
      'process.env.GURUKUL_DESKTOP_GOOGLE_CLIENT_SECRET': '""',
    });
  });
});

describe('pkce and authUrl', () => {
  it('makes a fresh S256 pair each time', () => {
    const a = pkce();
    const b = pkce();
    expect(a.verifier).toMatch(/^[\w-]{43}$/);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).toBe(createHash('sha256').update(a.verifier).digest('base64url'));
  });

  it('asks Google for a code, with PKCE, the state and the account picker', () => {
    const url = new URL(authUrl('cid', 'http://127.0.0.1:1234', 'st', 'ch'));
    expect(`${url.origin}${url.pathname}`).toBe(AUTH_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: 'cid',
      redirect_uri: 'http://127.0.0.1:1234',
      response_type: 'code',
      scope: 'openid email profile',
      code_challenge: 'ch',
      code_challenge_method: 'S256',
      state: 'st',
      prompt: 'select_account',
      hd: 'nonstopio.com',
    });
  });

  it('writes the browser page as plain constant HTML', () => {
    expect(page('Hello')).toContain('<p>Hello</p>');
    expect(page('Hello')).not.toMatch(/<script|https?:\/\//);
  });
});

describe('createGoogleSignIn', () => {
  it('answers not_configured when the build has no client, and opens nothing', async () => {
    const { signIn, deps, sink } = setup({ client: null });
    await expect(signIn()).resolves.toEqual({ ok: false, reason: 'not_configured' });
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('warn', 'Google sign-in refused', {
      reason: 'not configured',
    });
  });

  it('signs in: browser, state checked, code exchanged with the verifier, ID token only', async () => {
    const { signIn, fetch, sink, onSettled, consent, redirect, state } = setup();
    const result = signIn();
    const url = await consent();
    const redirectUri = String(url.searchParams.get('redirect_uri'));
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    // Not the redirect: other paths, other methods, and a redirect without our state.
    const other = new URL('/favicon.ico', redirectUri);
    expect((await globalThis.fetch(other)).status).toBe(404);
    expect((await redirect(url, { state: state(url), code: 'c' }, { method: 'POST' })).status).toBe(
      404,
    );
    const forged = await redirect(url, { state: 'guessed', code: 'attacker-code' });
    expect(forged).toEqual({ status: 400, text: expect.stringContaining('has ended') });
    expect(sink).toHaveBeenCalledWith('warn', 'Google sign-in callback refused', {
      reason: 'state',
    });
    expect(fetch).not.toHaveBeenCalled();

    const back = await redirect(url, { state: state(url), code: 'the-code', scope: 'email' });
    expect(back).toEqual({ status: 200, text: expect.stringContaining('You are signed in') });
    await expect(result).resolves.toEqual({ ok: true, idToken: ID_TOKEN });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetch.mock.calls[0] as [string, FetchInit];
    expect(endpoint).toBe(TOKEN_URL);
    expect(init.method).toBe('POST');
    const body = Object.fromEntries(new URLSearchParams(init.body));
    expect(body).toEqual({
      code: 'the-code',
      client_id: CLIENT.id,
      client_secret: CLIENT.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: expect.any(String),
    });
    expect(createHash('sha256').update(String(body.code_verifier)).digest('base64url')).toBe(
      url.searchParams.get('code_challenge'),
    );
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('info', 'Google sign-in ended', { outcome: 'signed in' });

    // The listener is gone once it has answered.
    await expect(globalThis.fetch(redirectUri)).rejects.toThrow();
    // Never a token, a code, the verifier or the secret in the log.
    const text = logged(sink);
    for (const secret of [ID_TOKEN, 'the-code', String(body.code_verifier), CLIENT.secret]) {
      expect(text).not.toContain(secret);
    }
  });

  it('sends no client secret when the build has none, and works without onSettled', async () => {
    const { signIn, fetch, consent, redirect, state } = setup({
      client: { id: 'cid', secret: null },
      onSettled: undefined,
    });
    const result = signIn();
    const url = await consent();
    await redirect(url, { state: state(url), code: 'c' });
    await expect(result).resolves.toMatchObject({ ok: true });
    const init = fetch.mock.calls[0]?.[1] as FetchInit;
    expect(new URLSearchParams(init.body).has('client_secret')).toBe(false);
  });

  it('answers a second redirect while the first is being exchanged as ended', async () => {
    let release: (v: Awaited<ReturnType<FetchLike>>) => void = () => undefined;
    const fetch = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { signIn, consent, redirect, state } = setup({ fetch });
    const result = signIn();
    const url = await consent();
    const first = redirect(url, { state: state(url), code: 'c' });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(await redirect(url, { state: state(url), code: 'c' })).toMatchObject({ status: 400 });
    release(tokenAnswer(200, { id_token: ID_TOKEN }));
    expect((await first).status).toBe(200);
    await expect(result).resolves.toMatchObject({ ok: true });
  });

  it.each([
    ['the person presses Cancel', { error: 'access_denied' }, 'cancelled', 'Sign-in cancelled'],
    ['Google reports another error', { error: 'server_error' }, 'failed', 'did not finish'],
    ['the redirect has no code', {}, 'failed', 'did not finish'],
  ])('answers %s', async (_label, params, reason, words) => {
    const { signIn, fetch, consent, redirect, state, onSettled } = setup();
    const result = signIn();
    const url = await consent();
    const back = await redirect(url, { state: state(url), ...params });
    expect(back).toEqual({ status: 200, text: expect.stringContaining(words) });
    await expect(result).resolves.toEqual({ ok: false, reason });
    expect(fetch).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalled();
  });

  it.each([
    ['refuses the code', tokenAnswer(400, { error: 'invalid_grant' }), { status: 400 }],
    [
      'answers without an ID token',
      tokenAnswer(200, { access_token: 'a' }),
      { reason: 'response' },
    ],
  ])('fails when Google’s token endpoint %s', async (_label, answer, fields) => {
    const { signIn, consent, redirect, state, sink } = setup({
      fetch: vi.fn<FetchLike>(async () => answer),
    });
    const result = signIn();
    const url = await consent();
    expect((await redirect(url, { state: state(url), code: 'c' })).text).toContain(
      'did not finish',
    );
    await expect(result).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(sink).toHaveBeenCalledWith('warn', 'Google sign-in failed', {
      step: 'exchange',
      ...fields,
    });
  });

  it('fails when Google’s token endpoint cannot be reached', async () => {
    const { signIn, consent, redirect, state, sink } = setup({
      fetch: vi.fn<FetchLike>(async () => {
        throw new TypeError('fetch failed');
      }),
    });
    const result = signIn();
    const url = await consent();
    await redirect(url, { state: state(url), code: 'c' });
    await expect(result).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(sink).toHaveBeenCalledWith('error', 'Google sign-in failed', {
      step: 'exchange',
      error: { name: 'TypeError' },
    });
  });

  it('times out cleanly when the browser never comes back, and closes the listener', async () => {
    const { signIn, consent, sink, onSettled } = setup({ timeoutMs: 30 });
    const result = signIn();
    const url = await consent();
    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('info', 'Google sign-in ended', { outcome: 'timeout' });
    await expect(globalThis.fetch(String(url.searchParams.get('redirect_uri')))).rejects.toThrow();
  });

  it('drops a token Google sends after the time is up', async () => {
    let release: (v: Awaited<ReturnType<FetchLike>>) => void = () => undefined;
    const fetch = vi.fn<FetchLike>(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { signIn, consent, redirect, state, onSettled } = setup({ fetch, timeoutMs: 200 });
    const result = signIn();
    const url = await consent();
    const back = redirect(url, { state: state(url), code: 'c' });
    await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' });
    release(tokenAnswer(200, { id_token: ID_TOKEN }));
    expect(await back).toEqual({ status: 400, text: expect.stringContaining('has ended') });
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it('keeps the first ending when the browser fails to open after the time is up', async () => {
    const { signIn, sink } = setup({
      timeoutMs: 10,
      openExternal: () =>
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('late')), 60)),
    });
    await expect(signIn()).resolves.toEqual({ ok: false, reason: 'timeout' });
    await vi.waitFor(() =>
      expect(sink).toHaveBeenCalledWith('error', 'Google sign-in failed', {
        step: 'browser',
        error: { name: 'Error' },
      }),
    );
    expect(sink.mock.calls.filter(([, event]) => event === 'Google sign-in ended')).toHaveLength(1);
  });

  it('fails when the system browser cannot be opened', async () => {
    const { signIn, sink } = setup({
      openExternal: vi.fn(async () => {
        throw new Error('no browser');
      }),
    });
    await expect(signIn()).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(sink).toHaveBeenCalledWith('error', 'Google sign-in failed', {
      step: 'browser',
      error: { name: 'Error' },
    });
  });

  it('fails when it cannot listen on the loopback address', async () => {
    const { signIn, deps, sink } = setup({ host: '192.0.2.1' });
    await expect(signIn()).resolves.toEqual({ ok: false, reason: 'failed' });
    expect(deps.openExternal).not.toHaveBeenCalled();
    expect(sink).toHaveBeenCalledWith('error', 'Google sign-in failed', {
      step: 'listen',
      error: expect.objectContaining({ name: 'Error' }),
    });
  });

  it('works when called twice: the second replaces a waiting first, with new state', async () => {
    const { signIn, consent, redirect, state } = setup();
    const first = signIn();
    const firstUrl = await consent(0);
    const second = signIn();
    await expect(first).resolves.toEqual({ ok: false, reason: 'cancelled' });
    const secondUrl = await consent(1);
    expect(state(secondUrl)).not.toBe(state(firstUrl));
    expect(secondUrl.searchParams.get('code_challenge')).not.toBe(
      firstUrl.searchParams.get('code_challenge'),
    );
    // The first listener is closed; the second signs in.
    await expect(
      globalThis.fetch(String(firstUrl.searchParams.get('redirect_uri'))),
    ).rejects.toThrow();
    await redirect(secondUrl, { state: state(secondUrl), code: 'c' });
    await expect(second).resolves.toEqual({ ok: true, idToken: ID_TOKEN });

    // And again, after both have ended.
    const third = signIn();
    const thirdUrl = await consent(2);
    await redirect(thirdUrl, { state: state(thirdUrl), code: 'c' });
    await expect(third).resolves.toMatchObject({ ok: true });
  });

  it('closes a listener replaced before it was even up, and opens one browser tab', async () => {
    const { signIn, deps, consent, redirect, state, sink } = setup();
    const first = signIn();
    const second = signIn();
    await expect(first).resolves.toEqual({ ok: false, reason: 'cancelled' });
    const url = await consent(0);
    await redirect(url, { state: state(url), code: 'c' });
    await expect(second).resolves.toMatchObject({ ok: true });
    expect(deps.openExternal).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls.filter(([, event]) => event === 'Google sign-in started')).toHaveLength(
      1,
    );
  });
});

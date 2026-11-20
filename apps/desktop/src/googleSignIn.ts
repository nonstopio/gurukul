import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import type { GoogleSignInFailure, GoogleSignInResult } from './bridge';
import type { GoogleClient } from './googleClient';
import type { Logger } from './log';

/**
 * `auth.googleSignIn`: Google sign-in in the system browser, because Google refuses sign-in inside
 * embedded windows (`.plan/22-desktop-studio.md`, Signing in to Gurukul). OAuth 2.0 for installed
 * apps, as Google documents it:
 *
 *   1. a fresh PKCE verifier (S256) and `state`, and a one-off HTTP listener on 127.0.0.1 at a port
 *      the system picks;
 *   2. Google's consent page in the system browser, redirecting back to that listener;
 *   3. the redirect must carry our `state`; its `code` is exchanged at Google's token endpoint with
 *      the verifier;
 *   4. the ID token goes to the window, which signs in to Firebase with it. Nothing else of
 *      Google's answer is kept: no access token, no refresh token, nothing written to disk.
 *
 * Tokens, codes and the verifier are never logged. The `@nonstopio.com` rule stays in the security
 * rules; `hd` only steers Google's account picker. A call while one is waiting replaces it (the
 * person closed the tab and pressed Sign in again): the first answers `cancelled`.
 */

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** How long the browser has to come back. */
export const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
/** How long Google's token endpoint has to answer. */
export const EXCHANGE_TIMEOUT_MS = 30 * 1000;

/** The part of `fetch` the exchange uses (Electron's `net.fetch` in the app, a fake in tests). */
export type FetchLike = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface GoogleSignInDeps {
  client: GoogleClient | null;
  openExternal(url: string): Promise<void>;
  fetch: FetchLike;
  log: Logger;
  /** Called once a sign-in ends, however it ends: the app brings its window back to the front. */
  onSettled?: (() => void) | undefined;
  timeoutMs?: number;
  /** The loopback address to listen on; tests change it to make listening fail. */
  host?: string;
}

const tokenResponse = z.object({
  id_token: z.string().regex(/^[\w-]+\.[\w-]+\.[\w-]+$/),
});

const base64url = (bytes: Buffer) => bytes.toString('base64url');

/** A PKCE pair (RFC 7636): 32 random bytes as the verifier, its SHA-256 as the challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash('sha256').update(verifier).digest()) };
}

/** The consent page's address. `select_account` so someone with several accounts can pick. */
export function authUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  challenge: string,
): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
    hd: 'nonstopio.com',
  }).toString();
  return url.toString();
}

/** What the browser tab says once it has done its part. Constant text, no outside resources. */
const PAGES: Record<'ok' | 'cancelled' | 'failed' | 'stale', [number, string]> = {
  ok: [200, 'You are signed in. Close this tab and go back to Gurukul Studio.'],
  cancelled: [200, 'Sign-in cancelled. Close this tab and go back to Gurukul Studio.'],
  failed: [200, 'Sign-in did not finish. Go back to Gurukul Studio and try again.'],
  stale: [400, 'This sign-in has ended. Go back to Gurukul Studio and try again.'],
};

export function page(text: string): string {
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Gurukul Studio</title><style>',
    ':root{color-scheme:light dark}',
    'body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box}',
    'p{max-width:32rem;margin:0}',
    `</style></head><body><main><p>${text}</p></main></body></html>`,
  ].join('');
}

function answer(res: ServerResponse, kind: keyof typeof PAGES): void {
  const [status, text] = PAGES[kind];
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    connection: 'close',
  });
  res.end(page(text));
}

/** `auth.googleSignIn`, over its adapters. */
export function createGoogleSignIn(deps: GoogleSignInDeps): () => Promise<GoogleSignInResult> {
  const { client, log, timeoutMs = SIGN_IN_TIMEOUT_MS, host = '127.0.0.1' } = deps;
  let cancelCurrent: (() => void) | null = null;

  const exchange = async (
    id: GoogleClient,
    code: string,
    redirectUri: string,
    verifier: string,
  ): Promise<GoogleSignInResult> => {
    const body = new URLSearchParams({
      code,
      client_id: id.id,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });
    if (id.secret !== null) body.set('client_secret', id.secret);
    try {
      const response = await deps.fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
      });
      if (!response.ok) {
        log.warn('Google sign-in failed', { step: 'exchange', status: response.status });
        return { ok: false, reason: 'failed' };
      }
      const parsed = tokenResponse.safeParse(await response.json());
      if (!parsed.success) {
        log.warn('Google sign-in failed', { step: 'exchange', reason: 'response' });
        return { ok: false, reason: 'failed' };
      }
      return { ok: true, idToken: parsed.data.id_token };
    } catch (error) {
      log.error('Google sign-in failed', error, { step: 'exchange' });
      return { ok: false, reason: 'failed' };
    }
  };

  const attempt = (id: GoogleClient): Promise<GoogleSignInResult> =>
    new Promise((resolve) => {
      const { verifier, challenge } = pkce();
      const state = base64url(randomBytes(32));
      const server = createServer();
      let redirectUri = '';
      let handled = false;
      let done = false;

      const finish = (result: GoogleSignInResult) => {
        // Only the first ending counts (a browser that fails to open after the time is up).
        if (done) return;
        done = true;
        clearTimeout(timer);
        server.close();
        // Always this attempt's: a newer one cancels this one before it takes the slot.
        cancelCurrent = null;
        log.info('Google sign-in ended', {
          outcome: result.ok ? 'signed in' : result.reason,
        });
        deps.onSettled?.();
        resolve(result);
      };
      const fail = (reason: GoogleSignInFailure) => finish({ ok: false, reason });
      const cancel = () => fail('cancelled');
      const timer = setTimeout(() => fail('timeout'), timeoutMs);
      cancelCurrent = cancel;

      server.on('request', (req: IncomingMessage, res: ServerResponse) => {
        // A server request always has a URL; String() keeps the type honest without a branch.
        const url = new URL(String(req.url), 'http://127.0.0.1');
        // The browser also asks for /favicon.ico and the like: only the redirect itself counts.
        if (req.method !== 'GET' || url.pathname !== '/') {
          res.writeHead(404, { connection: 'close' }).end();
          return;
        }
        // Without our state it is not Google's redirect for this sign-in: refuse it and wait on.
        if (url.searchParams.get('state') !== state) {
          log.warn('Google sign-in callback refused', { reason: 'state' });
          answer(res, 'stale');
          return;
        }
        if (handled || done) {
          answer(res, 'stale');
          return;
        }
        handled = true;
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        if (error !== null || code === null) {
          // `access_denied` is the person pressing Cancel; Google's other errors are failures.
          const reason = error === 'access_denied' ? 'cancelled' : 'failed';
          if (reason === 'failed') log.warn('Google sign-in failed', { step: 'consent' });
          answer(res, reason);
          fail(reason);
          return;
        }
        void exchange(id, code, redirectUri, verifier).then((result) => {
          // Timed out or replaced while Google answered: the app has moved on, so the token goes.
          if (done) {
            answer(res, 'stale');
            return;
          }
          answer(res, result.ok ? 'ok' : 'failed');
          finish(result);
        });
      });

      server.once('error', (error) => {
        log.error('Google sign-in failed', error, { step: 'listen' });
        fail('failed');
      });

      server.listen(0, host, () => {
        const { port } = server.address() as AddressInfo;
        redirectUri = `http://127.0.0.1:${port}`;
        // Not reached for an attempt replaced before it was up: `close` drops a pending listen on
        // an IP address, so the listener never opens (tested).
        log.info('Google sign-in started');
        deps.openExternal(authUrl(id.id, redirectUri, state, challenge)).catch((error: unknown) => {
          log.error('Google sign-in failed', error, { step: 'browser' });
          fail('failed');
        });
      });
    });

  return async () => {
    if (client === null) {
      log.warn('Google sign-in refused', { reason: 'not configured' });
      return { ok: false, reason: 'not_configured' };
    }
    cancelCurrent?.();
    return attempt(client);
  };
}

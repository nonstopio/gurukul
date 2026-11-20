import { describe, expect, it } from 'vitest';
import {
  DEV_URL,
  PRODUCTION_URL,
  allowedOrigins,
  isAllowedUrl,
  originOf,
  originsArgument,
  startUrl,
  testUrl,
} from '../src/config';

describe('config', () => {
  it('opens production in a packaged build and the dev server in development', () => {
    expect(startUrl(false)).toBe(PRODUCTION_URL);
    expect(startUrl(true)).toBe(DEV_URL);
  });

  it('allows only production in a packaged build', () => {
    expect(allowedOrigins(false)).toEqual(['https://gurukul.nonstopio.com']);
  });

  it('adds localhost:5173 in development only', () => {
    expect(allowedOrigins(true)).toEqual([
      'http://localhost:5173',
      'https://gurukul.nonstopio.com',
    ]);
  });

  it('reads an origin, or null for something that has none', () => {
    expect(originOf('https://gurukul.nonstopio.com/studio?x=1')).toBe(
      'https://gurukul.nonstopio.com',
    );
    expect(originOf('about:blank')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });

  it('matches whole origins, not prefixes', () => {
    const origins = allowedOrigins(false);
    expect(isAllowedUrl('https://gurukul.nonstopio.com/courses', origins)).toBe(true);
    expect(isAllowedUrl('https://gurukul.nonstopio.com.evil.example/', origins)).toBe(false);
    expect(isAllowedUrl('http://gurukul.nonstopio.com/', origins)).toBe(false);
    expect(isAllowedUrl('http://localhost:5173/', origins)).toBe(false);
    expect(isAllowedUrl('garbage', origins)).toBe(false);
  });

  it('takes a test page on this computer, in a development build only', () => {
    expect(testUrl(true, 'http://127.0.0.1:4173/studio')).toBe('http://127.0.0.1:4173/studio');
    expect(testUrl(true, 'http://localhost:4173')).toBe('http://localhost:4173/');
    // A packaged build never reads it, whatever it says.
    expect(testUrl(false, 'http://127.0.0.1:4173/studio')).toBeNull();
    expect(testUrl(true, undefined)).toBeNull();
    expect(testUrl(true, '')).toBeNull();
    expect(testUrl(true, 'not a url')).toBeNull();
    expect(testUrl(true, 'https://127.0.0.1:4173/')).toBeNull();
    expect(testUrl(true, 'http://evil.example:4173/')).toBeNull();
    expect(testUrl(true, 'http://127.0.0.1.evil.example:4173/')).toBeNull();
    expect(testUrl(true, 'http://127.0.0.1/')).toBeNull();
    expect(testUrl(true, 'http://user@127.0.0.1:4173/')).toBeNull();
    expect(testUrl(true, 'http://:secret@127.0.0.1:4173/')).toBeNull();
  });

  it('opens a test page and adds its origin in development only', () => {
    const test = 'http://127.0.0.1:4173/studio';
    expect(startUrl(true, test)).toBe(test);
    expect(startUrl(false, test)).toBe(PRODUCTION_URL);
    expect(allowedOrigins(true, test)).toEqual([
      'http://127.0.0.1:4173',
      'http://localhost:5173',
      'https://gurukul.nonstopio.com',
    ]);
    expect(allowedOrigins(false, test)).toEqual(['https://gurukul.nonstopio.com']);
  });

  it('carries the origins in one command-line flag', () => {
    expect(originsArgument(['https://a.example', 'http://b.example'])).toBe(
      '--gurukul-origins=https://a.example,http://b.example',
    );
  });
});

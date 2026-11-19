import { describe, expect, it } from 'vitest';
import {
  DEV_URL,
  PRODUCTION_URL,
  allowedOrigins,
  isAllowedUrl,
  originOf,
  originsArgument,
  startUrl,
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

  it('carries the origins in one command-line flag', () => {
    expect(originsArgument(['https://a.example', 'http://b.example'])).toBe(
      '--gurukul-origins=https://a.example,http://b.example',
    );
  });
});

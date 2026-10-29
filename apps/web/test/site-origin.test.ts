import { describe, expect, it } from 'vitest';
import { siteOrigin, verifyUrl } from '../src/certificates/pages';

describe('siteOrigin', () => {
  it('prefers the configured address and drops trailing slashes', () => {
    expect(siteOrigin('https://gurukul.example/', 'http://localhost')).toBe(
      'https://gurukul.example',
    );
  });

  it('falls back to where the app is open', () => {
    expect(siteOrigin(undefined, 'http://localhost')).toBe('http://localhost');
    expect(siteOrigin('', 'http://localhost')).toBe('http://localhost');
  });

  it('builds verify links from the default origin or a given one', () => {
    expect(verifyUrl('X-1')).toMatch(/\/verify\/X-1$/);
    expect(verifyUrl('X-1', 'https://gurukul.example')).toBe('https://gurukul.example/verify/X-1');
  });
});

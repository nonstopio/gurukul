import ROBOTS from '../public/robots.txt?raw';
import { describe, expect, it } from 'vitest';
import { ROUTE_PATHS } from '../src/route-paths';
import { PUBLIC } from '../src/routes';

/** Google's reading: the longest matching rule wins, Allow wins a tie, no match means allowed. */
function allowed(path: string, robots = ROBOTS): boolean {
  const rules = robots
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .flatMap((line) => {
      const [field = '', ...rest] = line.split(':');
      const pattern = rest.join(':').trim();
      const kind = field.trim().toLowerCase();
      return (kind === 'allow' || kind === 'disallow') && pattern
        ? [{ allow: kind === 'allow', pattern }]
        : [];
    });
  const matches = (pattern: string) => {
    const anchored = pattern.endsWith('$');
    const body = (anchored ? pattern.slice(0, -1) : pattern)
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path);
  };
  const best = rules
    .filter((rule) => matches(rule.pattern))
    .sort((a, b) => b.pattern.length - a.pattern.length || Number(b.allow) - Number(a.allow))[0];
  return best?.allow ?? true;
}

describe('the robots.txt reader used below', () => {
  it('follows the longest match, prefers Allow on a tie and anchors on $', () => {
    expect(allowed('/a/b', 'Disallow: /\nAllow: /a/')).toBe(true);
    expect(allowed('/a', 'Disallow: /a\nAllow: /a')).toBe(true);
    expect(allowed('/ab', 'Disallow: /\nAllow: /a$')).toBe(false);
    expect(allowed('/x/y.png', 'Disallow: /\nAllow: /*.png$')).toBe(true);
    expect(allowed('/anything', '# nothing')).toBe(true);
  });
});

describe('robots.txt', () => {
  it('is for every crawler', () => {
    expect(ROBOTS).toMatch(/^User-agent: \*$/m);
  });

  it('lets crawlers reach exactly the pages people can open signed out', () => {
    for (const route of ROUTE_PATHS) {
      const path = route.replace(/:[^/]+/g, 'sample-id');
      const isPublic = route === '/' || PUBLIC.includes(route);
      expect({ route, allowed: allowed(path) }).toEqual({ route, allowed: isPublic });
    }
  });

  it('lets crawlers fetch what the public pages need to render', () => {
    for (const file of [
      '/assets/index-AbC123.js',
      '/assets/index-AbC123.css',
      '/favicon.svg',
      '/favicon.ico',
      '/icon-512.png',
      '/apple-touch-icon.png',
    ]) {
      expect({ file, allowed: allowed(file) }).toEqual({ file, allowed: true });
    }
  });
});

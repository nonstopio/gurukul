// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssVar, roleTokens } from '../src';

const css = readFileSync(resolve(import.meta.dirname, '../src/tokens.css'), 'utf8');

describe('tokens', () => {
  it('wraps a role in var()', () => {
    expect(cssVar('accent')).toBe('var(--accent)');
  });

  it.each(roleTokens)('defines --%s in tokens.css', (token) => {
    expect(css).toMatch(new RegExp(`--${token}:`));
  });
});

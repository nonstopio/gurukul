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

  it('keeps the explicit dark block and the system dark block identical', () => {
    const body = (re: RegExp) =>
      (re.exec(css)?.[1] ?? '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n');
    const explicit = body(/:root\[data-theme='dark'\] \{([^}]*)\}/);
    const system = body(/:root:not\(\[data-theme='light'\]\) \{([^}]*)\}/);
    expect(explicit).not.toBe('');
    expect(system).toBe(explicit);
  });

  it('overrides every role the dark theme changes with a value of its own', () => {
    expect(css).toMatch(/\[data-theme='dark'\][^}]*--accent: #46d39b/);
  });
});

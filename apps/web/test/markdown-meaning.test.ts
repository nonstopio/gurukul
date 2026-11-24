import { describe, expect, it } from 'vitest';
import { isSafeLinkUrl, keepsMeaning } from '../src/studio/blocks/markdownMeaning';

describe('isSafeLinkUrl', () => {
  it.each([
    'https://example.com',
    'http://example.com/a?b=1',
    'mailto:a@example.com',
    ' https://x.io ',
  ])('accepts %s', (url) => expect(isSafeLinkUrl(url)).toBe(true));
  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com',
    '/relative',
    '#top',
    '',
  ])('refuses %j', (url) => expect(isSafeLinkUrl(url)).toBe(false));
});

describe('keepsMeaning', () => {
  it('ignores spelling that parses to the same tree', () => {
    expect(keepsMeaning('* one\n* two', '- one\n- two\n')).toBe(true);
    expect(keepsMeaning('__bold__ and *it*', '**bold** and _it_\n')).toBe(true);
    expect(keepsMeaning('~~gone~~', '~~gone~~\n')).toBe(true);
    expect(keepsMeaning('', '')).toBe(true);
  });

  it('refuses a rewrite that says something else', () => {
    expect(keepsMeaning('a\n\nb', 'a b\n')).toBe(false);
    expect(keepsMeaning('# A', '## A\n')).toBe(false);
  });

  it('refuses text with raw HTML, even when it comes back the same', () => {
    expect(keepsMeaning('a <b>b</b>', 'a <b>b</b>\n')).toBe(false);
    expect(keepsMeaning('> <div>x</div>', '> <div>x</div>\n')).toBe(false);
  });

  it('refuses a link to an address the editor drops, and keeps a safe one', () => {
    expect(keepsMeaning('[a](javascript:x)', '[a](javascript:x)\n')).toBe(false);
    expect(keepsMeaning('[a](https://example.com)', '[a](https://example.com)\n')).toBe(true);
  });
});

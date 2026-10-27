import { afterEach, describe, expect, it } from 'vitest';
import { focusBlock } from '../src/studio/focusBlock';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('focusBlock', () => {
  it('focuses the first field in the block and reports it done', () => {
    document.body.innerHTML = '<div data-block-id="b1"><p>x</p><textarea id="t"></textarea></div>';
    expect(focusBlock('b1')).toBeNull();
    expect(document.activeElement?.id).toBe('t');
  });

  it('hands the id back when the block is not in the page yet', () => {
    document.body.innerHTML = '<div data-block-id="other"><input /></div>';
    expect(focusBlock('b1')).toBe('b1');
    expect(document.activeElement).toBe(document.body);
  });
});

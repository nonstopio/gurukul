import { act } from 'react';
import { describe, expect, it } from 'vitest';

describe('main', () => {
  it('mounts the app into #root on load', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => {
      await import('../src/main');
    });
    expect(document.querySelector('#root h1')?.textContent).toBe('Gurukul is being built.');
  });

  it('fails loudly when #root is missing', async () => {
    const { mount } = await import('../src/main');
    expect(() => mount(null)).toThrow('#root element is missing');
  });
});

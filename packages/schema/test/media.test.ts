import { describe, expect, it } from 'vitest';
import { isEmbedAllowed, isPlaceholderVideo, videoEmbedUrl } from '../src';

describe('embeds', () => {
  it('allows only listed https hosts', () => {
    expect(isEmbedAllowed('https://www.loom.com/embed/abc')).toBe(true);
    expect(isEmbedAllowed('https://stackblitz.com/edit/x')).toBe(true);
    expect(isEmbedAllowed('http://www.loom.com/embed/abc')).toBe(false);
    expect(isEmbedAllowed('https://evil.example/x')).toBe(false);
    expect(isEmbedAllowed('not a url')).toBe(false);
  });

  it.each([
    [
      'youtube',
      'https://www.youtube.com/watch?v=abc123',
      'https://www.youtube-nocookie.com/embed/abc123',
    ],
    ['youtube', 'https://youtu.be/abc123', 'https://www.youtube-nocookie.com/embed/abc123'],
    [
      'youtube',
      'https://www.youtube.com/embed/abc123',
      'https://www.youtube-nocookie.com/embed/abc123',
    ],
    ['loom', 'https://www.loom.com/share/abc123', 'https://www.loom.com/embed/abc123'],
    ['loom', 'https://www.loom.com/embed/abc123', 'https://www.loom.com/embed/abc123'],
    [
      'drive',
      'https://drive.google.com/file/d/abc123/view',
      'https://drive.google.com/file/d/abc123/preview',
    ],
  ] as const)('turns a %s link into an embed URL', (provider, url, out) => {
    expect(videoEmbedUrl(provider, url)).toBe(out);
  });

  it.each([
    ['youtube', 'nonsense'],
    ['youtube', 'http://www.youtube.com/watch?v=abc123'],
    ['youtube', 'https://www.youtube.com/watch'],
    ['youtube', 'https://www.youtube.com/watch?v=a'],
    ['youtube', 'https://evil.example/watch?v=abc123'],
    ['loom', 'https://www.loom.com/other/abc'],
    ['loom', 'https://evil.example/share/abc'],
    ['drive', 'https://drive.google.com/open?id=abc'],
    ['drive', 'https://evil.example/file/d/abc/view'],
  ] as const)('refuses %s link %s', (provider, url) => {
    expect(videoEmbedUrl(provider, url)).toBeNull();
  });
});

describe('isPlaceholderVideo', () => {
  it('spots a link whose id is not recorded yet, and nothing else', () => {
    expect(isPlaceholderVideo('https://www.youtube.com/watch?v=TODO_RECORD_VIDEO')).toBe(true);
    expect(isPlaceholderVideo('https://youtu.be/TODO_RECORD_VIDEO')).toBe(true);
    expect(isPlaceholderVideo('https://youtu.be/abc123')).toBe(false);
    expect(isPlaceholderVideo('https://www.youtube.com/watch')).toBe(false);
    expect(isPlaceholderVideo('not a url')).toBe(false);
  });
});

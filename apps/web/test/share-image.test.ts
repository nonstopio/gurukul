import { describe, expect, it } from 'vitest';
import { shareImageTags } from '../src/seo/shareImage';

describe('shareImageTags', () => {
  it('points the preview image at the public address', () => {
    const html = shareImageTags('https://gurukul.example.com');
    expect(html).toContain(
      '<meta property="og:image" content="https://gurukul.example.com/icon-512.png" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://gurukul.example.com/icon-512.png" />',
    );
    expect(html).toContain('<meta property="og:url" content="https://gurukul.example.com/" />');
  });

  it('drops trailing slashes and spaces from the address', () => {
    expect(shareImageTags(' https://gurukul.example.com// ')).toContain(
      'content="https://gurukul.example.com/icon-512.png"',
    );
  });

  it('adds nothing when no public address is configured', () => {
    expect(shareImageTags(undefined)).toBe('');
    expect(shareImageTags('   ')).toBe('');
  });
});

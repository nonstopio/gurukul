import INDEX_HTML from '../index.html?raw';
import { describe, expect, it } from 'vitest';
import { shareImageTags, withShareImage } from '../src/seo/shareImage';

describe('shareImageTags', () => {
  it('points the preview image at the public address', () => {
    const html = shareImageTags('https://gurukul.example.com');
    expect(html).toContain(
      '<meta property="og:image" content="https://gurukul.example.com/icon-512.png" />',
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://gurukul.example.com/icon-512.png" />',
    );
    expect(html).toContain('<meta property="og:image:width" content="512" />');
  });

  it('uses the origin, whatever the address ends with', () => {
    for (const address of [
      ' https://gurukul.example.com// ',
      'https://gurukul.example.com/x?y#z',
    ]) {
      expect(shareImageTags(address)).toContain(
        'content="https://gurukul.example.com/icon-512.png"',
      );
    }
  });

  it('never claims a page address, so a shared link is not collapsed to the home page', () => {
    expect(shareImageTags('https://gurukul.example.com')).not.toContain('og:url');
  });

  it('adds nothing when no public address is configured', () => {
    expect(shareImageTags(undefined)).toBe('');
    expect(shareImageTags('   ')).toBe('');
  });

  it('stops the build on an address that is not http(s)', () => {
    for (const bad of ['gurukul.example.com', 'javascript:alert(1)', 'https://"><script>']) {
      expect(() => shareImageTags(bad)).toThrow('VITE_SITE_URL must be an http(s) address');
    }
  });
});

describe('withShareImage', () => {
  it('adds the tags inside the head of the real index.html', () => {
    const html = withShareImage(INDEX_HTML, 'https://gurukul.example.com');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain('og:image" content="https://gurukul.example.com/icon-512.png"');
  });

  it('leaves the page alone without an address', () => {
    expect(withShareImage(INDEX_HTML, undefined)).toBe(INDEX_HTML);
  });

  it('fails loudly when there is no head to add them to', () => {
    expect(() => withShareImage('<html></html>', 'https://gurukul.example.com')).toThrow(
      'no </head>',
    );
  });
});

describe('index.html', () => {
  const content = (pattern: RegExp) => pattern.exec(INDEX_HTML.replace(/\s+/g, ' '))?.[1];

  it('previews with the same title and description search results show', () => {
    const title = content(/<title>([^<]+)<\/title>/);
    const description = content(/name="description" content="([^"]+)"/);
    expect(title).toBeTruthy();
    expect(description).toBeTruthy();
    expect(content(/property="og:title" content="([^"]+)"/)).toBe(title);
    expect(content(/property="og:description" content="([^"]+)"/)).toBe(description);
    expect(content(/name="twitter:card" content="([^"]+)"/)).toBe('summary');
  });

  it('has no og:url, which would point every shared link at the home page', () => {
    expect(INDEX_HTML).not.toContain('property="og:url"');
  });
});

/**
 * The picture a link preview shows (Slack, WhatsApp, LinkedIn, mail). Open Graph wants an absolute
 * address, and the public address is configuration (`VITE_SITE_URL`, `.plan/11-deployment-and-cost.md`),
 * so `vite.config.ts` adds these tags to `index.html` at build time. Without an address there is
 * nothing absolute to point at, and previews fall back to the title and description alone.
 *
 * There is deliberately no `og:url`: every path serves the same `index.html`, so one would tell
 * LinkedIn and Facebook that a shared certificate or course link is the home page.
 */
export const SHARE_IMAGE = { path: '/icon-512.png', width: 512, height: 512, alt: 'Gurukul logo' };

/** The meta tags for the preview image, or '' when no address is configured. */
export function shareImageTags(siteUrl: string | undefined): string {
  const configured = siteUrl?.trim();
  if (!configured) return '';
  let origin: string;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('not http(s)');
    origin = url.origin;
  } catch {
    // A build with a broken address would ship previews pointing nowhere: stop it instead.
    throw new Error('VITE_SITE_URL must be an http(s) address, like https://gurukul.example.com');
  }
  const image = origin + SHARE_IMAGE.path;
  return [
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="${String(SHARE_IMAGE.width)}" />`,
    `<meta property="og:image:height" content="${String(SHARE_IMAGE.height)}" />`,
    `<meta property="og:image:alt" content="${SHARE_IMAGE.alt}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('\n    ');
}

/** `index.html` with the preview image tags at the end of its head. */
export function withShareImage(html: string, siteUrl: string | undefined): string {
  const tags = shareImageTags(siteUrl);
  if (!tags) return html;
  if (!html.includes('</head>'))
    throw new Error('index.html has no </head> to put the preview image in');
  return html.replace('</head>', `  ${tags}\n  </head>`);
}

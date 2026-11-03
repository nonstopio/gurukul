/**
 * The picture a link preview shows (Slack, WhatsApp, LinkedIn, mail). Open Graph wants an absolute
 * address, and the public address is configuration (`VITE_SITE_URL`, `.plan/11-deployment-and-cost.md`),
 * so `vite.config.ts` adds these tags to `index.html` at build time. Without an address there is
 * nothing absolute to point at, and previews fall back to the title and description alone.
 */
export const SHARE_IMAGE = { path: '/icon-512.png', width: 512, height: 512, alt: 'Gurukul logo' };

export function shareImageTags(siteUrl: string | undefined): string {
  const base = siteUrl?.trim().replace(/\/+$/, '');
  if (!base) return '';
  const url = base + SHARE_IMAGE.path;
  return [
    `<meta property="og:url" content="${base}/" />`,
    `<meta property="og:image" content="${url}" />`,
    `<meta property="og:image:width" content="${SHARE_IMAGE.width}" />`,
    `<meta property="og:image:height" content="${SHARE_IMAGE.height}" />`,
    `<meta property="og:image:alt" content="${SHARE_IMAGE.alt}" />`,
    `<meta name="twitter:image" content="${url}" />`,
  ].join('\n    ');
}

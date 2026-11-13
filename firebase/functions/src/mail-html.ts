/**
 * The HTML side of every email: one shared layout and the few pieces the four emails are built
 * from. Email clients ignore stylesheets and CSS variables, so this is `role="presentation"`
 * tables with every style inline and the brand colours from `packages/ui/src/tokens.css` as hex.
 * Every dynamic value goes through `escapeHtml`; nothing here trusts its input.
 */

/** Used only when `SITE_URL` is unset; deploys set it (repository variable `SITE_URL`). */
const DEFAULT_SITE = 'https://nonstop-gurukul.web.app';

/** The public site address in links: `SITE_URL` when set (staging, previews), else production. */
export const siteUrl = (): string => (process.env['SITE_URL'] || DEFAULT_SITE).replace(/\/+$/, '');

/** Where a learner writes with a question: replies reach this mailbox. */
export const CONTACT = 'gurukul@nonstopio.com';

export const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A paragraph of body copy. `html` is already escaped by the caller. */
export const paragraph = (html: string): string =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#27352d">${html}</p>`;

/** A small uppercase label above a group of courses. */
export const sectionLabel = (label: string): string =>
  `<div style="margin:24px 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;` +
  `text-transform:uppercase;color:#46554c">${escapeHtml(label)}</div>`;

const TONES = {
  late: { text: '#b42318', bg: '#fef3f2', line: '#f9c7c2' },
  soon: { text: '#93370d', bg: '#fffaeb', line: '#fedf89' },
  plain: { text: '#46554c', bg: '#ffffff', line: '#d6dbd2' },
} as const;

/** A bordered row for one course: title, a due line when there is one, and a link to open it. */
export function courseCard(course: {
  title: string;
  /** Without one the card has no link (a revoked certificate has nothing to open). */
  href?: string;
  due?: string;
  tone?: keyof typeof TONES;
}): string {
  const tone = TONES[course.tone ?? 'plain'];
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;margin:0 0 10px;background:${tone.bg};border:1px solid ${tone.line};border-radius:8px">` +
    `<tr><td style="padding:14px 16px;font-family:${FONT}">` +
    `<div style="font-size:16px;font-weight:700;line-height:1.4;color:#121c17;word-break:break-word">${escapeHtml(course.title)}</div>` +
    (course.due === undefined
      ? ''
      : `<div style="margin-top:4px;font-size:14px;font-weight:600;color:${tone.text}">${escapeHtml(course.due)}</div>`) +
    (course.href === undefined
      ? ''
      : `<div style="margin-top:8px;font-size:14px"><a href="${escapeHtml(course.href)}" ` +
        `style="color:#05764c;font-weight:600;text-decoration:underline">Open course</a></div>`) +
    `</td></tr></table>`
  );
}

/** A muted, bordered note. `html` is already escaped by the caller. */
export const callout = (html: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
  `style="width:100%;margin:8px 0 16px;background:#f6f7f3;border:1px solid #d6dbd2;border-radius:8px">` +
  `<tr><td style="padding:14px 16px;font-family:${FONT};font-size:14px;line-height:1.6;color:#46554c">${html}</td></tr></table>`;

/** The one call to action: a `<td bgcolor>` around the link, so Outlook paints the button too. */
export const button = (label: string, href: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px"><tr>` +
  `<td bgcolor="#05764c" style="background:#05764c;border-radius:8px">` +
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};` +
  `font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">` +
  `${escapeHtml(label)}</a></td></tr></table>`;

/** The whole page: preheader, header band, title, intro, body, optional button, footer. */
export function emailLayout(page: {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  intro: string;
  /** Ready-made HTML from the helpers above. */
  body: string;
  cta?: { label: string; href: string };
  /** Why the person got this email, plain text. */
  reason: string;
}): string {
  const site = siteUrl();
  const cell = `font-family:${FONT}`;
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light"><title>${escapeHtml(page.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f6f7f3">` +
    `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f7f3">${escapeHtml(page.preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f6f7f3">` +
    `<tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" ` +
    `style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d6dbd2;border-radius:12px;overflow:hidden">` +
    // Header band
    `<tr><td style="background:#0b211b;padding:20px 28px;${cell}">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="padding-right:12px"><img src="${escapeHtml(site)}/icon-192.png" alt="" width="36" height="36" style="display:block;border:0;border-radius:8px"></td>` +
    `<td style="${cell}"><div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#24d39a">${escapeHtml(page.eyebrow)}</div>` +
    `<div style="font-size:18px;font-weight:600;color:#ffffff">NonStop Gurukul</div></td>` +
    `</tr></table></td></tr>` +
    // Title, intro, body
    `<tr><td style="padding:28px 28px 8px;${cell}">` +
    `<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:600;color:#121c17;word-break:break-word">${escapeHtml(page.title)}</h1>` +
    paragraph(escapeHtml(page.intro)) +
    page.body +
    (page.cta ? button(page.cta.label, page.cta.href) : '') +
    `</td></tr>` +
    `<tr><td style="padding:16px 28px 0"><div style="border-top:1px solid #d6dbd2;font-size:0;line-height:0">&nbsp;</div></td></tr>` +
    // Footer band
    `<tr><td style="background:#eceee8;padding:20px 28px;${cell};font-size:12px;line-height:1.6;color:#46554c">` +
    `<div style="font-weight:600">NonStop Gurukul · NonStop io Technologies</div>` +
    `<div>${escapeHtml(page.reason)}</div>` +
    `<div><a href="${escapeHtml(site)}" style="color:#05764c">${escapeHtml(site)}</a></div>` +
    `<div>Questions? <a href="mailto:${CONTACT}" style="color:#05764c">${CONTACT}</a></div>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

import type { ReportedToast } from '@gurukul/ui';
import { ApiClientError } from './api';

/**
 * A failure on screen → a prefilled bug report on the public Gurukul repo, filling the fields of
 * `.github/ISSUE_TEMPLATE/bug.yml` by their ids. The person reads it and presses Submit on GitHub.
 * Issues are public, so the report holds what the app wrote (titles, catalog sentences, codes)
 * plus the page, browser and time; free text goes through `scrub` first.
 */
const NEW_ISSUE = 'https://github.com/nonstopio/gurukul/issues/new';
/** GitHub answers 414 past ~8k characters of URL. */
const MAX_TEXT = 1500;

export interface Problem {
  /** What failed, in words: a toast title or "A page crashed". */
  title: string;
  /** The sentence shown, or an error message. Scrubbed here, so callers cannot forget to. */
  message?: string | undefined;
  /** Codes worth quoting: `SRV-INTERNAL`, `PRK_4001`, a trace id. Written by the app, never by a person. */
  code?: string | undefined;
}

/** Emails, long numbers and long id-like tokens (uids, certificate ids) out. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>')
    .replace(/\b[\w-]{20,}\b/g, '<id>')
    .replace(/\d{5,}/g, '<n>')
    .slice(0, MAX_TEXT);
}

/** The bug form's Area for a path. */
function areaOf(path: string): string {
  if (path.startsWith('/admin')) return 'Admin console';
  if (path.startsWith('/studio')) return 'Studio';
  if (path.startsWith('/certificates') || path.startsWith('/verify')) return 'Certificates';
  return 'Learner';
}

/** The link that opens a new bug report for `problem` on the page being viewed now. */
export function issueUrl(problem: Problem): string {
  const path = scrub(window.location.pathname);
  const what = [
    `**${problem.title}** on \`${path}\`. Reported from the app.`,
    problem.message ? `\n> ${scrub(problem.message).replace(/\n/g, '\n> ')}` : '',
    // Codes are the app's own (catalog codes, trace ids, error names): kept whole, so a trace id
    // full of digits still finds its log lines.
    problem.code ? `\nCode: \`${problem.code}\`` : '',
    `\nTime: ${new Date().toISOString()}`,
    '\n### What I was doing\n\n<!-- This issue is public: no names, emails or answers. -->',
  ].join('\n');
  return `${NEW_ISSUE}?${new URLSearchParams({
    template: 'bug.yml',
    title: scrub(problem.title).slice(0, 120),
    what,
    area: areaOf(path),
    env: navigator.userAgent.slice(0, 200),
  })}`;
}

/** What finds a thrown error in the logs: the API code and trace id, else the error's name. */
export function codesOf(error: unknown): string | undefined {
  if (error instanceof ApiClientError) return `${error.code} · trace ${error.traceId}`;
  return error instanceof Error ? error.name : undefined;
}

/** The report link of an error toast: its words and codes, never what the person typed. */
export function reportToast(toast: ReportedToast): string {
  return issueUrl({
    title: toast.title ?? toast.message,
    message: toast.message,
    code: [toast.code, toast.detail].filter(Boolean).join(' · '),
  });
}

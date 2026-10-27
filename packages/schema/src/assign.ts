import { isAllowedEmail } from './user';

/** How one email in an assignment would be treated. */
export type EmailStatus = 'signedIn' | 'new' | 'alreadyAssigned' | 'rejected';

export interface ClassifiedEmail {
  email: string;
  status: EmailStatus;
  /** Why it was rejected; present only for `rejected`. */
  reason?: string;
}

export const normalizeEmailText = (email: string): string => email.trim().toLowerCase();

const SIMPLE_EMAIL = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]+$/;

/** Splits pasted text on commas, semicolons, spaces and new lines; empty pieces are dropped. */
export function parseEmailList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((piece) => piece.replace(/^["'<]+|["'>]+$/g, ''))
    .filter((piece) => piece !== '');
}

/**
 * The first column of a CSV, header optional: a first row that is not an email is treated as the
 * header and skipped. Quoted cells are unquoted; blank lines are ignored.
 */
export function parseCsvEmails(csv: string): string[] {
  const cells = csv
    .split(/\r?\n/)
    .map((line) => (line.split(',')[0] as string).trim().replace(/^"|"$/g, '').trim())
    .filter((cell) => cell !== '');
  const [first, ...rest] = cells;
  return first === undefined ? [] : SIMPLE_EMAIL.test(first) ? cells : rest;
}

/**
 * Normalises (trim, lower-case), dedupes and classifies every email, in first-seen order. Rejected
 * addresses never block an assignment: they are reported and skipped. The same function runs in the
 * browser (preview) and in `assignCourses`, so the preview is exactly what will happen.
 */
export function classifyEmails(
  raw: readonly string[],
  known: { signedIn: ReadonlySet<string>; assigned: ReadonlySet<string> },
  domain = 'nonstopio.com',
): ClassifiedEmail[] {
  const seen = new Set<string>();
  const out: ClassifiedEmail[] = [];
  for (const item of raw) {
    const email = normalizeEmailText(item);
    if (email === '' || seen.has(email)) continue;
    seen.add(email);
    if (!SIMPLE_EMAIL.test(email)) {
      out.push({ email, status: 'rejected', reason: 'Not a valid email address' });
    } else if (!isAllowedEmail(email, domain)) {
      out.push({ email, status: 'rejected', reason: `Not an @${domain} address` });
    } else if (known.assigned.has(email)) {
      out.push({ email, status: 'alreadyAssigned' });
    } else {
      out.push({ email, status: known.signedIn.has(email) ? 'signedIn' : 'new' });
    }
  }
  return out;
}

export interface AssignSummary {
  signedIn: number;
  newInvites: number;
  alreadyAssigned: number;
  rejected: { email: string; reason: string }[];
}

/** Counts a classification for the summary panel and for the function's response. */
export function summarize(classified: readonly ClassifiedEmail[]): AssignSummary {
  const count = (status: EmailStatus) => classified.filter((c) => c.status === status).length;
  return {
    signedIn: count('signedIn'),
    newInvites: count('new'),
    alreadyAssigned: count('alreadyAssigned'),
    rejected: classified
      .filter((c) => c.status === 'rejected')
      .map((c) => ({ email: c.email, reason: c.reason ?? '' })),
  };
}

/** The reminder cadence an assignment can carry. */
export type Reminder = 'weekly' | 'beforeDue' | 'none';

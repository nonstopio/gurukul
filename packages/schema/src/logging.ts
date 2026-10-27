/**
 * Log masking shared by the Cloud Functions logger and the browser logger. Pure, dependency-free,
 * never throws. The rules and the reasoning are in `.plan/17-logging.md`; the day-to-day form is the
 * `writing-logs` skill.
 *
 * Masking is automatic and keyed on the FIELD NAME, so a call site has nothing to remember:
 * `log.info('Signup', { email })` reaches the log as `email: 'ajay.*****'`. That is also why the
 * logging rule insists on structured fields — a value inside a sentence has no key to match.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type MaskType = 'REDACT' | 'EMAIL_PREFIX' | 'LAST4';

export interface MaskRule {
  /** Glob over the field name: `*` matches anything, no `*` means exact. Case-insensitive. */
  pattern: string;
  type: MaskType;
  /** Masked even at DEBUG and even when masking is switched off. For credentials and answer keys. */
  always?: boolean;
}

export const REDACTED = '[REDACTED]';

/** Credentials and quiz answer keys: never printable at any level. */
const ALWAYS: MaskRule[] = [
  '*password*',
  '*passwd*',
  '*secret*',
  '*token*',
  '*apikey*',
  '*authorization*',
  '*credential*',
  '*cookie*',
  '*privatekey*',
  '*answerkey*',
  '*correctoptionids*',
  '*sealedsecret*',
].map((pattern) => ({ pattern, type: 'REDACT' as const, always: true }));

export const DEFAULT_MASK_RULES: readonly MaskRule[] = [
  ...ALWAYS,
  { pattern: '*email*', type: 'EMAIL_PREFIX' },
  { pattern: '*phone*', type: 'LAST4' },
  { pattern: '*mobile*', type: 'LAST4' },
  ...[
    '*firstname*',
    '*lastname*',
    '*fullname*',
    '*displayname*',
    '*learnername*',
    '*username*',
    '*dob*',
    '*dateofbirth*',
    '*birthdate*',
    '*address*',
    '*ipaddress*',
    '*photourl*',
  ].map((pattern) => ({ pattern, type: 'REDACT' as const })),
];

/** Fields that look sensitive by name but are not: checked first, they beat any rule. */
export const DEFAULT_MASK_EXCLUDES: readonly string[] = [
  '*credentialid*',
  '*emailverified*',
  '*emailtype*',
  '*emailtemplate*',
  '*emailprefix*',
  '*coursename*',
  '*teamname*',
  '*functionname*',
  '*filename*',
  '*displaynamekey*',
];

export interface MaskOptions {
  level?: LogLevel;
  /** Mask DEBUG like every other level. Off by default: DEBUG is the one place payloads may live. */
  maskDebug?: boolean;
  /** Mask nothing except `always` rules. Local debugging only. */
  enabled?: boolean;
  rules?: readonly MaskRule[];
  excludes?: readonly string[];
}

/** Whether `name` matches a glob, case-insensitively. */
export function globMatches(pattern: string, name: string): boolean {
  const re = new RegExp(
    `^${pattern
      .toLowerCase()
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );
  return re.test(name.toLowerCase());
}

/** The first email-shaped token, to keep its first five characters: `ajay.*****`. */
export function maskValue(value: unknown, type: MaskType): string {
  const text = String(value);
  if (type === 'REDACT') return REDACTED;
  if (type === 'LAST4') {
    const digits = text.replace(/\D/g, '');
    return digits.length > 0 ? `****${digits.slice(-4)}` : REDACTED;
  }
  const local = text.split('@')[0] as string;
  return `${local.slice(0, 5)}*****`;
}

function ruleFor(name: string, o: MaskOptions): MaskRule | undefined {
  const excludes = o.excludes ?? DEFAULT_MASK_EXCLUDES;
  if (excludes.some((g) => globMatches(g, name))) return undefined;
  const rules = (o.rules ?? DEFAULT_MASK_RULES).filter((r) => globMatches(r.pattern, name));
  // An `always` rule wins over a partial one, so a field matching both is fully redacted.
  const rule = rules.find((r) => r.always) ?? rules[0];
  if (!rule) return undefined;
  const maskable = o.enabled !== false && !(o.level === 'debug' && o.maskDebug !== true);
  return rule.always || maskable ? rule : undefined;
}

const MAX_DEPTH = 6;

/**
 * Masks a structured payload: every field whose NAME matches a rule, at any depth (arrays and
 * nested objects too). Returns a copy; the input is never mutated. Cycles and over-deep values are
 * cut off rather than followed.
 */
export function maskFields(fields: unknown, options: MaskOptions = {}, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[TRUNCATED]';
  if (Array.isArray(fields)) return fields.map((v) => maskFields(v, options, depth + 1));
  if (fields instanceof Error)
    return { name: fields.name, message: maskLine(fields.message, options) };
  if (fields === null || typeof fields !== 'object') return fields;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
    const rule = ruleFor(key, options);
    out[key] =
      rule && value !== null && value !== undefined
        ? maskValue(value, rule.type)
        : maskFields(value, options, depth + 1);
  }
  return out;
}

// Every part is length-bounded (RFC 5321 limits) and labels exclude dots, so matching cannot go polynomial.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}/g;

/**
 * Masks a rendered line of text: `key=value` and `"key":"value"` pairs by key, then any bare email
 * address. A safety net for text that was never structured (an exception message, a third-party
 * library) — not a licence to log prose.
 */
export function maskLine(text: string, options: MaskOptions = {}): string {
  const pair = /([A-Za-z_][\w.-]*)(=|":\s*")([^\s,;"&}]+)/g;
  const swept = text.replace(pair, (whole, key: string, sep: string, value: string) => {
    const rule = ruleFor(key, options);
    return rule ? `${key}${sep}${maskValue(value, rule.type)}` : whole;
  });
  const maskable =
    options.enabled !== false && !(options.level === 'debug' && options.maskDebug !== true);
  return maskable ? swept.replace(EMAIL, (m) => maskValue(m, 'EMAIL_PREFIX')) : swept;
}

/** The standard field names. Use these rather than inventing synonyms. */
export const STANDARD_LOG_FIELDS = [
  'uid',
  'courseId',
  'itemId',
  'parikshaId',
  'questionId',
  'attemptId',
  'assignmentId',
  'credentialId',
  'emailPrefix',
  'count',
  'durationMs',
  'status',
  'source',
  'reason',
  'code',
  'traceId',
] as const;

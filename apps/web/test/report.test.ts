import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@gurukul/schema';
import { ApiClientError } from '../src/api';
import { codesOf, engineMessage, issueUrl, reportToast, scrub } from '../src/report';

function params(url: string) {
  return new URL(url).searchParams;
}

afterEach(() => window.history.replaceState(null, '', '/'));

describe('scrub', () => {
  it('takes out emails, long ids and long numbers, keeps the words', () => {
    expect(scrub('asha@nonstopio.com hit uid Zx9qL2mN8pR4sT6vW1yA3bC5 at 1730600000')).toBe(
      '<email> hit uid <id> at <n>',
    );
    expect(scrub('Cannot read properties of undefined')).toBe(
      'Cannot read properties of undefined',
    );
    expect(scrub('word '.repeat(400))).toHaveLength(1500);
  });
});

describe('issueUrl', () => {
  it('fills the bug form: title, what happened with page and codes, area and browser', () => {
    window.history.replaceState(null, '', '/studio/courses/git');
    const p = params(
      issueUrl({ title: 'Could not save', message: 'Line one\nfor a@b.co', code: 'SRV-INTERNAL' }),
    );
    expect(p.get('template')).toBe('bug.yml');
    expect(p.get('title')).toBe('Could not save');
    expect(p.get('area')).toBe('Studio');
    expect(p.get('env')).toBe(navigator.userAgent);
    const what = p.get('what') as string;
    expect(what).toContain('`/studio/courses/git`');
    expect(what).toContain('> Line one\n> for <email>');
    expect(what).toContain('Code: `SRV-INTERNAL`');
    expect(what).toContain('Time: ');
    expect(what).toContain('Build: dev');
  });

  it('scrubs the title in both places it appears', () => {
    const p = params(issueUrl({ title: 'Could not add asha@nonstopio.com' }));
    expect(p.get('title')).toBe('Could not add <email>');
    expect(p.get('what')).not.toContain('asha@');
  });

  it('keeps a trace id whole, digits and all', () => {
    const what = params(issueUrl({ title: 't', code: 'GEN_5001 · trace a1234567890bcdef' })).get(
      'what',
    );
    expect(what).toContain('Code: `GEN_5001 · trace a1234567890bcdef`');
  });

  it('leaves out a missing message and code', () => {
    const what = params(issueUrl({ title: 'A page crashed' })).get('what') as string;
    expect(what).not.toContain('Code:');
    expect(what).not.toContain('> ');
  });

  it.each([
    ['/admin/learners', 'Admin console'],
    ['/certificates/abc', 'Certificates'],
    ['/verify/abc', 'Certificates'],
    ['/courses/git', 'Learner'],
  ])('files %s under %s', (path, area) => {
    window.history.replaceState(null, '', path);
    expect(params(issueUrl({ title: 't' })).get('area')).toBe(area);
  });
});

describe('reportToast', () => {
  it('reports a toast by its title, sentence and codes', () => {
    const what = (t: Parameters<typeof reportToast>[0]) => params(reportToast(t));
    const full = what({
      title: 'Broke',
      message: 'Try again.',
      code: 'SRV-INTERNAL',
      detail: 'GEN_5001 · trace t1',
    });
    expect(full.get('title')).toBe('Broke');
    expect(full.get('what')).toContain('Code: `SRV-INTERNAL · GEN_5001 · trace t1`');
    const bare = what({ title: undefined, message: 'Failed', code: undefined, detail: undefined });
    expect(bare.get('title')).toBe('Failed');
    expect(bare.get('what')).not.toContain('Code:');
  });
});

describe('codesOf', () => {
  it('gives the API code and trace id, an error name, or nothing', () => {
    const d = ERROR_CODES.GEN_5003;
    const api = new ApiClientError(d.status, [
      {
        code: 'GEN_5003',
        title: d.title,
        category: d.category,
        retryable: d.retryable,
        userMessage: d.userMessage,
        developerMessage: 'x',
        details: {},
        traceId: 'tr1',
      },
    ]);
    expect(codesOf(api)).toBe('GEN_5003 · trace tr1');
    expect(codesOf(new RangeError('x'))).toBe('RangeError');
    expect(codesOf('a string')).toBeUndefined();
  });
});

describe('engineMessage', () => {
  it('passes a JavaScript engine error message, and nothing else', () => {
    expect(engineMessage(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
      "Cannot read properties of undefined (reading 'x')",
    );
    expect(engineMessage(new ReferenceError('a is not defined'))).toBe('a is not defined');
    expect(engineMessage(new RangeError('Invalid time value'))).toBe('Invalid time value');
    expect(engineMessage(new SyntaxError('"asha" is not valid JSON'))).toBeUndefined();
    expect(engineMessage(new Error('users/abc denied'))).toBeUndefined();
    expect(engineMessage('a string')).toBeUndefined();
  });
});

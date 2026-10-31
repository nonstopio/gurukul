import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Certificate,
  Seal,
  StatCard,
  courseFontSize,
  nameFontSize,
  printCertificateClass,
} from '../src';
import { axeViolations } from './axe';

const cert = {
  learnerName: 'Priya Kulkarni',
  courseTitle: 'Git, the NonStop Way',
  issuedOn: '9 November 2026',
  credentialId: 'GK-2026-0001',
  verifyUrl: 'gurukul.example.com/verify/abc',
  signatoryName: 'Asha Rao',
  signatoryRole: 'Admin',
};

describe('nameFontSize', () => {
  it('is 32 for names up to 40 characters', () => {
    expect(nameFontSize('Priya Kulkarni')).toBe(32);
    expect(nameFontSize('a'.repeat(40))).toBe(32);
    expect(nameFontSize(`  ${'a'.repeat(40)}  `)).toBe(32);
  });
  it('shrinks for longer names', () => {
    expect(nameFontSize('a'.repeat(50))).toBe(25);
  });
  it('never goes below 22', () => {
    expect(nameFontSize('a'.repeat(59))).toBe(22);
    expect(nameFontSize('a'.repeat(200))).toBe(22);
  });
});

describe('courseFontSize', () => {
  it('is 72 for titles up to 22 characters', () => {
    expect(courseFontSize('Git for teams')).toBe(72);
    expect(courseFontSize(`  ${'a'.repeat(22)}  `)).toBe(72);
  });
  it('shrinks for longer titles', () => {
    expect(courseFontSize('a'.repeat(33))).toBe(48);
  });
  it('never goes below 40', () => {
    expect(courseFontSize('a'.repeat(40))).toBe(40);
    expect(courseFontSize('a'.repeat(120))).toBe(40);
  });
});

describe('Seal', () => {
  it('is one labelled image whose ring text runs on its own circle path', () => {
    const { container } = render(<Seal label="Seal of X" ringText="X · CERTIFIED · " />);
    const svg = screen.getByRole('img', { name: 'Seal of X' });
    expect(svg.getAttribute('width')).toBe('132');
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
    const paths = container.querySelectorAll('textPath');
    expect(paths).toHaveLength(3);
    const ring = container.querySelector('defs path');
    for (const path of paths) {
      expect(path.textContent).toBe('X · CERTIFIED · ');
      expect(path.getAttribute('href')).toBe(`#${ring?.id}`);
    }
    const marks = container.querySelectorAll('.g-seal__mark');
    expect([...marks].map((m) => m.textContent)).toEqual(['G', 'G', 'G']);
  });
  it('draws wax: a cast shadow, a body, a raised rim, a pressed well and three relief layers', () => {
    const { container } = render(<Seal label="s" ringText="r" />);
    for (const part of ['cast', 'body', 'rim', 'well']) {
      expect(container.querySelectorAll(`.g-seal__${part}`)).toHaveLength(1);
    }
    expect(container.querySelectorAll('.g-seal__gloss')).toHaveLength(2);
    for (const layer of ['light', 'dark', 'face']) {
      expect(container.querySelector(`.g-seal__layer--${layer}`)).toBeTruthy();
    }
  });
  it('points every paint at its own gradients, so two seals on a page do not collide', () => {
    const { container } = render(
      <>
        <Seal label="a" ringText="r" />
        <Seal label="b" ringText="r" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    for (const el of container.querySelectorAll('[fill^="url("], [stroke^="url("], [filter]')) {
      for (const attr of ['fill', 'stroke', 'filter']) {
        const ref = /^url\(#(.+)\)$/.exec(el.getAttribute(attr) ?? '')?.[1];
        if (ref) expect(ids).toContain(ref);
      }
    }
  });
  it('takes a size, a centre mark and a class', () => {
    const { container } = render(
      <Seal label="s" ringText="r" size={64} centerText="N" className="x" />,
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('64');
    expect(svg?.getAttribute('class')).toBe('g-seal x');
    expect(container.querySelector('.g-seal__mark')?.textContent).toBe('N');
  });
  it('colours wax with wax roles only', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/seal.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const role of ['wax', 'wax-light', 'wax-deep', 'wax-shine', 'wax-shadow']) {
      expect(css).toContain(`var(--${role})`);
    }
  });
  it('has no axe violations', async () => {
    const { container } = render(<Seal label="Seal" ringText="r" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('StatCard', () => {
  it('renders label, value and sub as a dl', () => {
    const { container } = render(<StatCard label="Completion" value="72%" sub="42 of 58" />);
    expect(container.querySelector('dl')).toBeTruthy();
    expect(screen.getByText('Completion').tagName).toBe('DT');
    expect(screen.getByText('72%').tagName).toBe('DD');
    expect(screen.getByText('42 of 58')).toBeTruthy();
  });
  it('omits the sub line and takes a class', () => {
    const { container } = render(<StatCard label="Learners" value={58} className="x" />);
    expect(container.querySelectorAll('dd')).toHaveLength(1);
    expect(container.querySelector('dl')?.className).toBe('g-stat x');
  });
  it('has no axe violations', async () => {
    const { container } = render(<StatCard label="L" value="1" sub="s" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('Certificate', () => {
  it('shows every field as real text', () => {
    render(<Certificate {...cert} />);
    for (const text of Object.values(cert)) expect(screen.getByText(text)).toBeTruthy();
    expect(screen.getByText('Certificate of completion')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Seal of NonStop Gurukul' })).toBeTruthy();
    expect(screen.queryByText(/Revoked/)).toBeNull();
  });
  it('carries the print class and extra classes', () => {
    const { container } = render(<Certificate {...cert} className="x" />);
    expect(printCertificateClass).toBe('g-cert-print');
    expect(container.firstElementChild?.className).toBe('g-cert g-cert-print x');
  });
  it('uses a custom organisation', () => {
    render(<Certificate {...cert} organisation="Acme Academy" />);
    expect(screen.getByRole('img', { name: 'Seal of Acme Academy' })).toBeTruthy();
    expect(screen.getByText('Acme Academy')).toBeTruthy();
  });
  it('shows a REVOKED band in words when revoked', () => {
    const { container } = render(<Certificate {...cert} revoked />);
    expect(screen.getByText(/Revoked: this certificate is no longer valid/)).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('g-cert--revoked');
  });
  it('sizes the name and the course title by length', () => {
    const { rerender } = render(<Certificate {...cert} />);
    expect(screen.getByText('Priya Kulkarni').style.fontSize).toBe('32px');
    expect(screen.getByText('Git, the NonStop Way').style.fontSize).toBe('72px');
    const longName = 'Long '.repeat(11).trim();
    const longCourse = 'A very long course title about many things';
    rerender(<Certificate {...cert} learnerName={longName} courseTitle={longCourse} />);
    expect(screen.getByText(longName).style.fontSize).toBe('23px');
    expect(screen.getByText(longCourse).style.fontSize).toBe('40px');
  });
  it('makes the course title the largest line and the name a smaller one', () => {
    render(<Certificate {...cert} />);
    expect(screen.getByText('Git, the NonStop Way').className).toBe('g-cert__course');
    expect(screen.getByText('Priya Kulkarni').className).toBe('g-cert__name');
    expect(screen.getByText('has completed the course')).toBeTruthy();
  });
  it('heads the sheet with the organisation and draws its art out of the reading order', () => {
    const { container } = render(<Certificate {...cert} />);
    expect(container.querySelector('.g-cert__org')?.textContent).toBe('NonStop Gurukul');
    expect(container.querySelector('.g-cert__art')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.g-cert__divider')?.getAttribute('aria-hidden')).toBe('true');
    const seal = screen.getByRole('img', { name: 'Seal of NonStop Gurukul' });
    expect(seal.getAttribute('width')).toBe('180');
    expect(container.querySelector('textPath')?.textContent).toBe('NONSTOP GURUKUL · CERTIFIED · ');
  });
  it('labels the details Issued, Credential and Verify', () => {
    const { container } = render(<Certificate {...cert} />);
    expect([...container.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Issued',
      'Credential',
      'Verify',
    ]);
  });
  it('has no axe violations, valid or revoked', async () => {
    const { container, rerender } = render(<Certificate {...cert} />);
    expect(await axeViolations(container)).toEqual([]);
    rerender(<Certificate {...cert} revoked />);
    expect(await axeViolations(container)).toEqual([]);
  });
  it('prints A4 landscape with no margin and hides everything else', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/certificate.css'), 'utf8');
    expect(css).toMatch(/@page\s*{\s*size: A4 landscape;\s*margin: 0;/);
    expect(css).toContain(`.${printCertificateClass} .g-cert__sheet`);
    expect(css).toMatch(/body \*\s*{\s*visibility: hidden/);
    expect(css).toMatch(/print-color-adjust: exact/);
  });
  it('keeps the paper colours fixed: no theme-dependent role and no colour literal', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/certificate.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const role of ['accent', 'text', 'text-muted', 'surface', 'bg', 'danger', 'danger-soft']) {
      expect(css).not.toContain(`var(--${role})`);
    }
  });
});

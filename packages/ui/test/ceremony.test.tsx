import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Certificate, Seal, StatCard, nameFontSize, printCertificateClass } from '../src';
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
  it('is 66 for names up to 28 characters', () => {
    expect(nameFontSize('Priya Kulkarni')).toBe(66);
    expect(nameFontSize('a'.repeat(28))).toBe(66);
    expect(nameFontSize(`  ${'a'.repeat(28)}  `)).toBe(66);
  });
  it('shrinks for longer names', () => {
    expect(nameFontSize('a'.repeat(32))).toBe(57);
  });
  it('never goes below 44', () => {
    expect(nameFontSize('a'.repeat(42))).toBe(44);
    expect(nameFontSize('a'.repeat(200))).toBe(44);
  });
});

describe('Seal', () => {
  it('is an image with a label and the ring text on a path', () => {
    const { container } = render(<Seal label="Seal of X" ringText="X · CERTIFIED · " />);
    expect(screen.getByRole('img', { name: 'Seal of X' }).getAttribute('width')).toBe('132');
    expect(container.querySelector('textPath')?.textContent).toBe('X · CERTIFIED · ');
    expect(container.querySelector('textPath')?.getAttribute('href')).toBe(
      `#${container.querySelector('path')?.id}`,
    );
    expect(container.querySelector('.g-seal__mark')?.textContent).toBe('G');
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
  it('sizes the name by length', () => {
    const { rerender } = render(<Certificate {...cert} />);
    expect(screen.getByText('Priya Kulkarni').style.fontSize).toBe('66px');
    rerender(<Certificate {...cert} learnerName={'Long '.repeat(9).trim()} />);
    expect(screen.getByText('Long '.repeat(9).trim()).style.fontSize).toBe('44px');
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
  });
});

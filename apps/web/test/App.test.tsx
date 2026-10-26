import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, goTo, titleFor } from '../src/App';
import { axeViolations } from './axe';
import { normalizePath, screenFor } from '../src/routes';

describe('App', () => {
  it('shows the placeholder shell with links to the repository and the changelog', () => {
    render(<App path="/" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Gurukul is being built.' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'NonStop io' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View the repository' }).getAttribute('href')).toBe(
      'https://github.com/nonstopio/gurukul',
    );
    expect(screen.getByRole('link', { name: 'What has changed' }).getAttribute('href')).toBe(
      '/changelog',
    );
  });

  it('shows the changelog at /changelog, with or without a trailing slash', () => {
    const { unmount } = render(<App path="/changelog" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
    unmount();
    render(<App path="/changelog/" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Changelog' })).toBeTruthy();
  });

  it('shows a not-found page for anything else', () => {
    render(<App path="/nowhere" />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'This page does not exist.' }),
    ).toBeTruthy();
  });

  it('offers global search on every page and navigates with it', () => {
    const navigate = vi.fn();
    render(<App path="/nowhere" navigate={navigate} />);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'changelog' } });
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('/changelog');
  });
});

describe('routes', () => {
  it('normalises trailing slashes, keeping the root', () => {
    expect(normalizePath('/changelog///')).toBe('/changelog');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
    expect(screenFor('/missing')).toBeUndefined();
  });
});

describe('goTo', () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: original, configurable: true });
  });

  it('does a full page load', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
    goTo('/changelog');
    expect(assign).toHaveBeenCalledWith('/changelog');
  });
});

describe('titleFor', () => {
  it('names the page from its navigation label', () => {
    expect(titleFor('/changelog/')).toBe('Changelog · Gurukul');
    expect(titleFor('/')).toBe('Gurukul · NonStop Academy');
    expect(titleFor('/nowhere')).toBe('Page not found · Gurukul');
    expect(titleFor('/changelog', [])).toBe('Gurukul · NonStop Academy');
  });

  it('is applied to the document', () => {
    render(<App path="/changelog" />);
    expect(document.title).toBe('Changelog · Gurukul');
  });
});

describe('accessibility', () => {
  it.each(['/', '/changelog', '/nowhere'])('%s has no axe violations', async (path) => {
    const { container } = render(<App path={path} navigate={vi.fn()} />);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has none with the search palette open', async () => {
    render(<App path="/" navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

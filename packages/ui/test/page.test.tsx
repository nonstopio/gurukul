import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Page } from '../src/Page';
import { axeViolations } from './axe';

describe('Page', () => {
  it('is a div at the default width holding its children', async () => {
    const { container } = render(
      <Page data-testid="p">
        <p>Body</p>
      </Page>,
    );
    const page = screen.getByTestId('p');
    expect(page.tagName).toBe('DIV');
    expect(page.className).toBe('g-page g-page--default');
    expect(page.firstElementChild?.textContent).toBe('Body');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('takes a width and a class', () => {
    render(
      <Page data-testid="p" width="reading" className="x">
        <p>Body</p>
      </Page>,
    );
    expect(screen.getByTestId('p').className).toBe('g-page g-page--reading x');
  });

  it('puts an aside in its own column after the main one', async () => {
    const { container } = render(
      <Page data-testid="p" width="wide" aside={<p>Summary</p>}>
        <p>Body</p>
      </Page>,
    );
    const page = screen.getByTestId('p');
    expect(page.className).toBe('g-page g-page--wide g-page--aside');
    const [main, aside] = Array.from(page.children);
    expect(main?.className).toBe('g-page__main');
    expect(main?.textContent).toBe('Body');
    expect(aside?.className).toBe('g-page__aside');
    expect(aside?.textContent).toBe('Summary');
    expect(await axeViolations(container)).toEqual([]);
  });
});

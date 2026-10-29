import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Callout,
  Card,
  Chip,
  EmptyState,
  ProgressBar,
  ProgressRing,
  Skeleton,
  type CalloutTone,
  type ChipTone,
} from '../src';
import { axeViolations } from './axe';

describe('Chip', () => {
  it.each<ChipTone>(['neutral', 'accent', 'warning', 'danger', 'info', 'solid'])(
    'renders the %s tone with its word',
    (tone) => {
      render(<Chip tone={tone}>Completed</Chip>);
      expect(screen.getByText('Completed').className).toBe(`g-chip g-chip--${tone}`);
    },
  );

  it('is neutral by default and takes extra classes and props', () => {
    render(
      <Chip className="x" data-testid="c">
        New
      </Chip>,
    );
    expect(screen.getByTestId('c').className).toBe('g-chip g-chip--neutral x');
  });
});

describe('ProgressBar', () => {
  it('exposes value, range and name, and prints the percentage', () => {
    render(<ProgressBar value={42.4} label="Course progress" />);
    const bar = screen.getByRole('progressbar', { name: 'Course progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(screen.getByText('42%')).toBeTruthy();
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('42%');
  });

  it('clamps out-of-range values', () => {
    render(
      <>
        <ProgressBar value={-5} label="low" />
        <ProgressBar value={250} label="high" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: 'low' }).getAttribute('aria-valuenow')).toBe(
      '0',
    );
    expect(screen.getByRole('progressbar', { name: 'high' }).getAttribute('aria-valuenow')).toBe(
      '100',
    );
  });

  it('can hide the printed percentage and takes a class', () => {
    const { container } = render(
      <ProgressBar value={10} label="p" showValue={false} className="wide" />,
    );
    expect(container.querySelector('.g-progress__text')).toBeNull();
    expect(container.firstElementChild?.className).toBe('g-progress wide');
  });

  it('prints a caption in place of the percentage', () => {
    render(<ProgressBar value={44} label="Course progress" caption="44% · 10 / 22" />);
    expect(screen.getByText('44% · 10 / 22')).toBeTruthy();
    expect(screen.queryByText('44%')).toBeNull();
  });
});

describe('ProgressRing', () => {
  it('exposes value and name, and draws the arc proportionally', () => {
    const { container } = render(<ProgressRing value={25} label="Parva progress" />);
    const ring = screen.getByRole('progressbar', { name: 'Parva progress' });
    expect(ring.getAttribute('aria-valuenow')).toBe('25');
    const fill = container.querySelector('.g-ring__fill') as SVGCircleElement;
    const circumference = Number(fill.getAttribute('stroke-dasharray'));
    expect(Number(fill.getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75);
    expect(screen.getByText('25%')).toBeTruthy();
  });

  it('honours size and stroke, clamps, and takes a class', () => {
    const { container } = render(
      <ProgressRing value={400} label="r" size={80} stroke={8} className="big" />,
    );
    const ring = screen.getByRole('progressbar');
    expect(ring.getAttribute('aria-valuenow')).toBe('100');
    expect(ring.className).toBe('g-ring big');
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('80');
    expect(container.querySelector('.g-ring__track')?.getAttribute('r')).toBe('36');
  });
});

describe('Card', () => {
  it('is a flat div by default', () => {
    render(<Card data-testid="c">Body</Card>);
    const card = screen.getByTestId('c');
    expect(card.tagName).toBe('DIV');
    expect(card.className).toBe('g-card');
  });

  it('can be highlighted and rendered as another element', () => {
    render(
      <Card as="section" highlighted className="x" aria-label="Current parva">
        Body
      </Card>,
    );
    const card = screen.getByRole('region', { name: 'Current parva' });
    expect(card.className).toBe('g-card g-card--highlighted x');
  });
});

describe('Callout', () => {
  it.each<CalloutTone>(['note', 'tip', 'warning'])('renders the %s tone', (tone) => {
    render(
      <Callout tone={tone} title="Heads up">
        Body text
      </Callout>,
    );
    const box = screen.getByRole('note');
    expect(box.className).toBe(`g-callout g-callout--${tone}`);
    expect(box.textContent).toContain('Heads up');
    expect(box.textContent).toContain('Body text');
    expect(box.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is a note by default', () => {
    render(<Callout title="FYI" className="x" />);
    expect(screen.getByRole('note').className).toBe('g-callout g-callout--note x');
  });
});

describe('EmptyState', () => {
  it('renders a heading and nothing else when given only a title', () => {
    const { container } = render(<EmptyState title="No courses yet" />);
    expect(screen.getByRole('heading', { level: 3, name: 'No courses yet' })).toBeTruthy();
    expect(container.querySelector('.g-empty__text')).toBeNull();
    expect(container.querySelector('.g-empty__action')).toBeNull();
    expect(container.querySelector('.g-empty__icon')).toBeNull();
  });

  it('renders icon, text and action, at the requested heading level', () => {
    render(
      <EmptyState
        title="Nothing assigned"
        headingAs="h2"
        icon={<svg data-testid="i" />}
        action={<button type="button">Browse</button>}
        className="x"
      >
        Ask a Kulapati.
      </EmptyState>,
    );
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    expect(screen.getByText('Ask a Kulapati.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeTruthy();
    expect(screen.getByTestId('i').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive tech and is a text line by default', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.className).toBe('g-skeleton g-skeleton--text');
  });

  it('takes a shape, size, class and style', () => {
    const { container } = render(
      <Skeleton shape="block" width="60%" height={80} className="x" style={{ margin: 4 }} />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toBe('g-skeleton g-skeleton--block x');
    expect(el.style.width).toBe('60%');
    expect(el.style.height).toBe('80px');
    expect(el.style.margin).toBe('4px');
  });

  it('draws a circle', () => {
    const { container } = render(<Skeleton shape="circle" />);
    expect(container.firstElementChild?.className).toContain('g-skeleton--circle');
  });
});

describe('display components accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = render(
      <main>
        <Chip>Draft</Chip>
        <ProgressBar value={40} label="Course progress" />
        <ProgressRing value={60} label="Parva progress" />
        <Card highlighted as="section" aria-label="Current">
          Body
        </Card>
        <Callout tone="warning" title="Careful">
          Body
        </Callout>
        <EmptyState title="Empty" action={<button type="button">Go</button>}>
          Nothing here.
        </EmptyState>
        <div aria-busy="true">
          <Skeleton />
        </div>
      </main>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

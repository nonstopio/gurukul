import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarChart, FunnelBar, largestDrop, niceMax } from '../src';
import { axeViolations } from './axe';

const weeks = Array.from({ length: 12 }, (_, i) => ({ label: `W${i + 1}`, value: (i + 1) * 3 }));

describe('niceMax', () => {
  it('rounds up to a clean axis end', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-4)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(3)).toBe(4);
    expect(niceMax(36)).toBe(40);
    expect(niceMax(41)).toBe(50);
    expect(niceMax(148)).toBe(200);
    expect(niceMax(0.3)).toBeCloseTo(0.4);
  });
});

describe('BarChart', () => {
  it('renders nothing for empty data', () => {
    const { container } = render(<BarChart data={[]} title="Weekly active" />);
    expect(container.firstChild).toBeNull();
  });

  it('draws one bar per datum, the last in accent with a value label, plus gridlines and y labels', () => {
    const { container } = render(
      <BarChart data={weeks} title="Weekly active learners" unit="learners" />,
    );
    const bars = container.querySelectorAll('.g-chart__bar');
    expect(bars).toHaveLength(12);
    expect(container.querySelectorAll('.g-chart__bar--last')).toHaveLength(1);
    expect(bars[11]?.classList.contains('g-chart__bar--last')).toBe(true);
    expect(container.querySelectorAll('.g-chart__grid')).toHaveLength(5);
    expect(
      Array.from(container.querySelectorAll('.g-chart__tick')).map((t) => t.textContent),
    ).toEqual(['0', '10', '20', '30', '40']);
    expect(container.querySelector('.g-chart__value')?.textContent).toBe('36');
    expect(container.querySelectorAll('.g-chart__x')).toHaveLength(12);
  });

  it('is an image with a summary label and a hidden table of the same data', () => {
    render(
      <BarChart data={weeks} title="Weekly active learners" unit="learners" labelHeader="Week" />,
    );
    const img = screen.getByRole('img', {
      name: /Weekly active learners\. 12 bars\. W1: 3 learners; W12: 36 learners\. Highest: W12, 36 learners\./,
    });
    expect(img).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Weekly active learners' });
    expect(within(table).getAllByRole('row')).toHaveLength(13);
    expect(within(table).getByRole('columnheader', { name: 'Week' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'learners' })).toBeTruthy();
    expect(within(table).getByRole('row', { name: 'W2 6' })).toBeTruthy();
  });

  it('works without a unit and with a single zero bar', async () => {
    const { container } = render(<BarChart data={[{ label: 'W1', value: 0 }]} title="Quiet" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Quiet. 1 bars. W1: 0; W1: 0. Highest: W1, 0.',
    );
    expect(screen.getByRole('columnheader', { name: 'Value' })).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('keeps the highest bar when an earlier one is larger', () => {
    render(
      <BarChart
        data={[
          { label: 'A', value: 9 },
          { label: 'B', value: 2 },
        ]}
        title="T"
      />,
    );
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Highest: A, 9');
  });

  it('has no axe violations', async () => {
    const { container } = render(<BarChart data={weeks} title="Weekly active learners" />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('largestDrop', () => {
  it('returns null for empty, single, all increasing and flat series', () => {
    expect(largestDrop([])).toBeNull();
    expect(largestDrop([5])).toBeNull();
    expect(largestDrop([1, 2, 3])).toBeNull();
    expect(largestDrop([4, 4, 4])).toBeNull();
  });

  it('returns the index of the step with the biggest drop from the previous one', () => {
    expect(largestDrop([100, 80, 30, 25])).toBe(2);
    expect(largestDrop([10, 20, 5])).toBe(2);
    expect(largestDrop([10, 9])).toBe(1);
  });

  it('picks the first of tied drops', () => {
    expect(largestDrop([100, 80, 60])).toBe(1);
  });
});

describe('FunnelBar', () => {
  const rows = [
    { label: 'Assigned', value: 100 },
    { label: 'Started', value: 80 },
    { label: 'Finished', value: 20 },
  ];

  it('renders labelled rows with bars relative to the largest value', () => {
    const { container } = render(<FunnelBar rows={rows} label="Where learners stop" />);
    const list = screen.getByRole('list', { name: 'Where learners stop' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('.g-funnel__fill')).map(
        (f) => f.style.width,
      ),
    ).toEqual(['100%', '80%', '20%']);
    expect(screen.getByText('20').className).toBe('g-funnel__count');
    expect(screen.queryByText('Largest drop')).toBeNull();
  });

  it('marks the highlighted row with words, not only colour', () => {
    const { container } = render(
      <FunnelBar
        rows={rows}
        label="Where learners stop"
        highlight={largestDrop(rows.map((r) => r.value))}
      />,
    );
    expect(screen.getByText('Largest drop')).toBeTruthy();
    expect(container.querySelectorAll('.g-funnel__row--drop')).toHaveLength(1);
    expect(screen.getByText('Finished').closest('li')?.className).toContain('g-funnel__row--drop');
  });

  it('takes its own highlight words and copes with all-zero rows', async () => {
    const { container } = render(
      <FunnelBar
        rows={[
          { label: 'A', value: 0 },
          { label: 'B', value: 0 },
        ]}
        label="Empty"
        highlight={1}
        highlightLabel="Biggest loss"
      />,
    );
    expect(screen.getByText('Biggest loss')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.g-funnel__fill')?.style.width).toBe('0%');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FunnelBar rows={rows} label="Where learners stop" highlight={2} />,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

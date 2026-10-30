import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FlowPanel, FlowSteps, Stepper, SuccessCheck } from '../src';
import { axeViolations } from './axe';

const STEPS = ['Course', 'Audience', 'Schedule', 'Review'];

describe('FlowSteps', () => {
  it('marks done, current and upcoming steps and collapses to a sentence', async () => {
    const { container } = render(<FlowSteps steps={STEPS} current={1} label="Assign progress" />);
    const list = within(screen.getByRole('navigation', { name: 'Assign progress' })).getByRole(
      'list',
    );
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]?.className).toContain('is-done');
    expect(items[0]?.textContent).toContain('(done)');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[2]?.getAttribute('aria-current')).toBeNull();
    expect(items[2]?.textContent).not.toContain('(done)');
    expect(screen.getByText('Step 2 of 4: Audience')).toBeTruthy();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('is named Progress by default and is Stepper.Flow too', () => {
    render(<Stepper.Flow steps={STEPS} current={0} />);
    expect(screen.getByRole('navigation', { name: 'Progress' })).toBeTruthy();
  });
});

describe('FlowPanel', () => {
  it('slides in from the side of travel', () => {
    const { rerender } = render(<FlowPanel data-testid="p">a</FlowPanel>);
    expect(screen.getByTestId('p').className).toContain('g-flow-panel--forward');
    rerender(
      <FlowPanel data-testid="p" direction="back" className="extra">
        a
      </FlowPanel>,
    );
    expect(screen.getByTestId('p').className).toContain('g-flow-panel--back');
    expect(screen.getByTestId('p').className).toContain('extra');
  });
});

describe('SuccessCheck', () => {
  it('is a decorative drawn tick of the size asked for', async () => {
    const { container } = render(<SuccessCheck size={40} className="x" />);
    const svg = container.querySelector('svg') as SVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('width')).toBe('40');
    expect(svg.getAttribute('class')).toContain('x');
    render(<SuccessCheck />);
    expect(document.querySelectorAll('svg')[1]?.getAttribute('width')).toBe('56');
    expect(await axeViolations(container)).toEqual([]);
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BlockFrame, ColourSwatch, LayoutPicker, TypeTile, roleTokens } from '../src';
import { axeViolations } from './axe';

describe('BlockFrame', () => {
  it('renders the header, controls, handle and body', () => {
    render(
      <BlockFrame label="VIDEO" handle={<button>grip</button>} controls={<span>ctl</span>}>
        <p>body</p>
      </BlockFrame>,
    );
    const group = screen.getByRole('group', { name: 'VIDEO block' });
    expect(group.className).toBe('g-block');
    expect(screen.getByText('VIDEO')).toBeTruthy();
    expect(screen.getByText('ctl')).toBeTruthy();
    expect(screen.getByText('grip')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Duplicate|Delete/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows Duplicate and Delete only when handlers are given, and calls them', () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(
      <BlockFrame label="CODE" onDuplicate={onDuplicate} onDelete={onDelete}>
        x
      </BlockFrame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate CODE block' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete CODE block' }));
    expect(onDuplicate).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('renders only the one handler given', () => {
    render(
      <BlockFrame label="TEXT" onDelete={() => {}}>
        x
      </BlockFrame>,
    );
    expect(screen.queryByRole('button', { name: 'Duplicate TEXT block' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete TEXT block' })).toBeTruthy();
  });

  it('marks the selected state', () => {
    render(
      <BlockFrame label="TEXT" selected>
        x
      </BlockFrame>,
    );
    expect(screen.getByRole('group').className).toContain('g-block--selected');
  });

  it('shows an error as an alert under the header', async () => {
    const { container } = render(
      <BlockFrame label="VIDEO" error="Add a video link" onDelete={() => {}}>
        x
      </BlockFrame>,
    );
    expect(screen.getByRole('alert').textContent).toBe('Add a video link');
    expect(screen.getByRole('group').className).toContain('g-block--error');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('has no axe violations with everything on', async () => {
    const { container } = render(
      <BlockFrame label="TEXT" selected onDuplicate={() => {}} onDelete={() => {}}>
        <p>hello</p>
      </BlockFrame>,
    );
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('LayoutPicker', () => {
  it('shows three named tiles and marks the current one pressed', async () => {
    const { container } = render(<LayoutPicker value="split" onChange={() => {}} label="Layout" />);
    expect(screen.getByRole('group', { name: 'Layout' })).toBeTruthy();
    const pressed = screen
      .getAllByRole('button')
      .map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(pressed).toEqual([
      ['Stacked', 'false'],
      ['Split', 'true'],
      ['Article', 'false'],
    ]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('reports the chosen layout', () => {
    const onChange = vi.fn();
    render(<LayoutPicker value="stacked" onChange={onChange} label="Layout" />);
    fireEvent.click(screen.getByRole('button', { name: 'Article' }));
    expect(onChange).toHaveBeenCalledWith('article');
  });
});

describe('ColourSwatch', () => {
  it('is a radio group of four named swatches with one checked', async () => {
    const { container } = render(
      <ColourSwatch value="sky" onChange={() => {}} label="Cover theme" />,
    );
    expect(screen.getByRole('radiogroup', { name: 'Cover theme' })).toBeTruthy();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => [r.value, r.checked])).toEqual([
      ['forest', false],
      ['sand', false],
      ['sky', true],
      ['stone', false],
    ]);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(screen.getByRole('radio', { name: 'Sand' })).toBeTruthy();
    expect(container.querySelectorAll('.g-swatch__check')).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('reports the chosen theme', () => {
    const onChange = vi.fn();
    render(<ColourSwatch value="forest" onChange={onChange} label="Cover theme" />);
    fireEvent.click(screen.getByRole('radio', { name: 'Stone' }));
    expect(onChange).toHaveBeenCalledWith('stone');
  });

  it('has cover tokens for every theme', () => {
    for (const t of ['cover-forest', 'cover-sand', 'cover-sky', 'cover-stone'])
      expect(roleTokens).toContain(t);
  });
});

describe('TypeTile', () => {
  it.each([
    ['reading', 'Reading'],
    ['video', 'Video'],
    ['code', 'Code'],
    ['pariksha', 'Pariksha'],
  ] as const)('%s carries its name as text', async (kind, name) => {
    const { container } = render(<TypeTile kind={kind} />);
    expect(screen.getByText(name)).toBeTruthy();
    expect(container.firstElementChild?.className).toContain(`g-tile--${kind}`);
    expect(await axeViolations(container)).toEqual([]);
  });
});

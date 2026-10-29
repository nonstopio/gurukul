import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BankQuestion } from '../src/studio/types';
import { axeViolations } from './axe';
import { fakeStudio } from './fake-studio';
import { openApp } from './harness';

const entry = (id: string, over: Partial<BankQuestion> = {}): BankQuestion => ({
  id,
  question: {
    id: `q-${id}`,
    kind: 'single',
    prompt: `Prompt ${id}?`,
    options: [
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Beta' },
    ],
    explanation: 'Because',
  },
  answers: ['b'],
  tags: ['git'],
  createdBy: 'u1',
  ...over,
});
async function open(bank: BankQuestion[], roles: Array<'educator' | 'admin'> = ['educator']) {
  const studio = fakeStudio({ bank });
  const view = await openApp('/studio/bank', { roles, studio });
  return { ...view, studio };
}
const cards = () =>
  Array.from(screen.getByRole('list', { name: 'Bank questions' }).children) as HTMLElement[];

describe('question bank', () => {
  it('lists each question with its kind, tags and who added it', async () => {
    await open([
      entry('1'),
      entry('2', {
        createdBy: 'u9',
        tags: ['sql', 'joins'],
        question: { ...entry('2').question, kind: 'multiple' },
      }),
    ]);
    expect(await screen.findByRole('heading', { name: 'Question bank' })).toBeTruthy();
    const [first, second] = await waitFor(() => {
      const found = cards();
      expect(found).toHaveLength(2);
      return found;
    });
    expect(within(first as HTMLElement).getByText('Prompt 1?')).toBeTruthy();
    expect(within(first as HTMLElement).getByText('Single choice')).toBeTruthy();
    expect(within(first as HTMLElement).getByText('git')).toBeTruthy();
    expect(within(first as HTMLElement).getByText('Added by you')).toBeTruthy();
    expect(within(second as HTMLElement).getByText('Multiple choice')).toBeTruthy();
    expect(within(second as HTMLElement).getByText('Added by a colleague')).toBeTruthy();
    expect(screen.getByText(/save the question again/)).toBeTruthy();
  });

  it('shows the answers and marks the correct one in words', async () => {
    await open([entry('1')]);
    const card = (await waitFor(() => cards()))[0] as HTMLElement;
    expect(within(card).getByText('Beta (correct)')).toBeTruthy();
    expect(within(card).getByText('Alpha')).toBeTruthy();
  });

  it('has no accessibility violations', async () => {
    const { container } = await open([entry('1'), entry('2', { createdBy: 'u9' })]);
    await screen.findByRole('list', { name: 'Bank questions' });
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows an empty state', async () => {
    const { container } = await open([]);
    expect(await screen.findByRole('heading', { name: 'The question bank is empty' })).toBeTruthy();
    expect(screen.queryByLabelText('Search by text or tag')).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('shows a warning when the bank cannot be read', async () => {
    const studio = fakeStudio();
    studio.data.questionBank = vi.fn().mockRejectedValue(new Error('denied'));
    await openApp('/studio/bank', { roles: ['educator'], studio });
    expect(await screen.findByText('This did not load')).toBeTruthy();
  });

  it('searches by text and by tag', async () => {
    await open([entry('1'), entry('2', { tags: ['sql'] })]);
    const search = await screen.findByLabelText('Search by text or tag');
    fireEvent.change(search, { target: { value: 'SQL' } });
    expect(cards()).toHaveLength(1);
    expect(within(cards()[0] as HTMLElement).getByText('Prompt 2?')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'prompt 1' } });
    expect(within(cards()[0] as HTMLElement).getByText('Prompt 1?')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByRole('heading', { name: 'Nothing matches' })).toBeTruthy();
  });

  it('lets the creator delete their own question after confirming', async () => {
    const { studio } = await open([entry('1'), entry('2', { createdBy: 'u9' })]);
    await screen.findByRole('list', { name: 'Bank questions' });
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete this question from the bank?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(studio.data.removeFromBank).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    vi.mocked(studio.data.questionBank).mockResolvedValue([entry('2', { createdBy: 'u9' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    await waitFor(() => expect(studio.data.removeFromBank).toHaveBeenCalledWith('1'));
    expect(await screen.findByText('Removed from the question bank')).toBeTruthy();
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.queryByText('Prompt 1?')).toBeNull();
  });

  it('shows no Delete button to someone who did not add the question', async () => {
    await open([entry('1', { createdBy: 'u9' })]);
    await screen.findByRole('list', { name: 'Bank questions' });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('lets an Admin delete any question', async () => {
    await open([entry('1', { createdBy: 'u9' }), entry('2', { createdBy: 'u8' })], ['admin']);
    await screen.findByRole('list', { name: 'Bank questions' });
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
  });

  it('says so when a delete fails and keeps the list', async () => {
    const { studio } = await open([entry('1')]);
    vi.mocked(studio.data.removeFromBank).mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete question' }));
    expect(await screen.findByText(/Couldn.t remove the question/)).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });
});

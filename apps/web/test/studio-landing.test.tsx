import { act, fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draftDoc, fakeStudio } from './fake-studio';
import { fakeData, makeCourse } from './fake-data';
import { openApp } from './harness';

/** Publishing needs a landing description and two outcomes; the checklist sends you to fix them. */
describe('Course editor: the Landing page publish checks', () => {
  it('lists the missing description and outcomes, and opens the Landing page tab', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    const draft = { ...live, description: '', outcomes: ['Commit', ' '] };
    await openApp(`/studio/courses/${live.id}`, {
      roles: ['educator'],
      studio: fakeStudio({ draft: draftDoc(draft, { rev: 5, answers: { q1: { k1: ['a'] } } }) }),
      data: fakeData({ courses: [live] }),
    });
    await screen.findByRole('tab', { name: 'Structure' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publish v4' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add a description on the Landing page.')).toBeTruthy();
    expect(
      within(dialog).getByText('Add at least 2 outcomes on the Landing page (you have 1).'),
    ).toBeTruthy();
    expect(
      within(dialog).getByText('Outcome 2 is empty. Fill it in or remove it on the Landing page.'),
    ).toBeTruthy();
    const open = within(dialog).getAllByRole('button', { name: 'Open the Landing page' });
    expect(open).toHaveLength(3);
    fireEvent.click(open[0] as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Landing page' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByLabelText('Description').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Outcome 1').getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByLabelText('Outcome 2').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText('Fill it in or remove it.')).toBeTruthy();
  });

  it('says what each learning rule does, in the chosen names', async () => {
    const live = makeCourse({ educatorIds: ['u1'], version: 3 });
    await openApp(`/studio/courses/${live.id}`, {
      roles: ['educator'],
      labels: 'gurukul',
      studio: fakeStudio({ draft: draftDoc(live, { rev: 5, answers: {} }) }),
      data: fakeData({ courses: [live] }),
    });
    await screen.findByRole('tab', { name: 'Structure' });
    const described = (name: string) => {
      const id = screen.getByRole('switch', { name }).getAttribute('aria-describedby');
      return document.getElementById(id as string)?.textContent;
    };
    // Each card says what happens now: its name and line follow the switch.
    const flip = (name: string) => fireEvent.click(screen.getByRole('switch', { name }));
    expect(described('Shishyas go in order')).toBe(
      'Each Parva opens once the one before is passed: its Parikshas, or every lesson if it has none.',
    );
    flip('Shishyas go in order');
    expect(described('Shishyas go in any order')).toBe(
      'Every Parva is open from the start. A Pariksha set to block the next Parva still locks what follows it.',
    );
    expect(described('Issue a certificate')).toBe(
      'Shishyas who finish every lesson and pass every Pariksha get a certificate anyone can verify.',
    );
    flip('Issue a certificate');
    expect(described('No certificate')).toBe('Shishyas who finish get no certificate.');
    expect(described('Videos are optional')).toBe(
      'A lesson can be marked complete without playing its videos, unless the lesson itself is set to complete after 90% of the video.',
    );
    flip('Videos are optional');
    expect(described('Require watching videos')).toBe(
      'A lesson with a video can be marked complete only after 90% of each video is played, not skipped.',
    );
  });
});

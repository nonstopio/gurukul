import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupKey } from '../src/studio/draftBackup';
import { fakeData, makeCourse } from './fake-data';
import { draftDoc, fakeStudio } from './fake-studio';
import { openApp } from './harness';

vi.mock('../src/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const live = makeCourse({ acharyaIds: ['u1'], version: 3 });

async function open(rev = 5) {
  const studio = fakeStudio({ draft: draftDoc(live, { rev }) });
  const app = await openApp(`/studio/courses/${live.id}`, {
    roles: ['acharya'],
    studio,
    data: fakeData({ courses: [live] }),
  });
  await screen.findByRole('tab', { name: 'Structure' });
  return { ...app, studio };
}
const edit = async (title: string) => {
  fireEvent.change(screen.getByLabelText('Title'), { target: { value: title } });
  await act(async () => {
    vi.advanceTimersByTime(1100);
  });
};

describe('Unsaved edits in the course editor', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('keeps a failed save on this device and offers it back next time', async () => {
    const first = await open();
    first.studio.data.saveDraft = vi.fn().mockRejectedValue(new Error('offline'));
    await edit('Kept');
    await screen.findByRole('button', { name: 'retry' });
    const stored = JSON.parse(localStorage.getItem(backupKey('u1', live.id)) ?? 'null');
    expect(stored).toMatchObject({ rev: 5, work: { course: { title: 'Kept' } } });
    first.unmount();

    const second = await open();
    expect(await screen.findByText('Unsaved edits from this device')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore edits' }));
    expect(screen.queryByText('Unsaved edits from this device')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Kept' })).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1100);
    });
    await waitFor(() => expect(screen.getByText('Saved')).toBeTruthy());
    expect(localStorage.getItem(backupKey('u1', live.id))).toBeNull();
    expect(second.studio.data.saveDraft).toHaveBeenCalled();
  });

  it('lets the Acharya discard the kept edits', async () => {
    localStorage.setItem(
      backupKey('u1', live.id),
      JSON.stringify({ rev: 5, savedAt: 1, work: { course: live, answers: {} } }),
    );
    await open();
    fireEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Unsaved edits from this device')).toBeNull();
    expect(localStorage.getItem(backupKey('u1', live.id))).toBeNull();
  });

  it('drops kept edits made on an older revision of the draft', async () => {
    localStorage.setItem(
      backupKey('u1', live.id),
      JSON.stringify({ rev: 2, savedAt: 1, work: { course: live, answers: {} } }),
    );
    await open(5);
    expect(screen.queryByText('Unsaved edits from this device')).toBeNull();
    expect(localStorage.getItem(backupKey('u1', live.id))).toBeNull();
  });

  it('saves a draft that is only waiting for autosave, then leaves', async () => {
    const { router } = await open();
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Quick' } });
    await act(async () => {
      await router.navigate('/studio');
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks before leaving when the save fails, and honours Stay and Leave', async () => {
    const { router, studio } = await open();
    studio.data.saveDraft = vi.fn().mockRejectedValue(new Error('offline'));
    await edit('Lost?');
    await screen.findByRole('button', { name: 'retry' });
    await act(async () => {
      await router.navigate('/studio');
    });
    expect(await screen.findByRole('dialog', { name: 'Leave with unsaved changes?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(router.state.location.pathname).toBe(`/studio/courses/${live.id}`);

    await act(async () => {
      await router.navigate('/studio');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'));
  });
});

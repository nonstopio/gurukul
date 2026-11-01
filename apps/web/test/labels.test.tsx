import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { article, terms } from '../src/labels/terms';
import { useTerms } from '../src/labels/useTerms';
import { fakeData } from './fake-data';
import { openApp } from './harness';

describe('terms', () => {
  it('lower-cases generic names mid-sentence and keeps Gurukul names as proper nouns', () => {
    const g = terms('generic');
    expect([g.Learner, g.learners, g.Admin, g.quizzes, g.studio, g.analytics]).toEqual([
      'Learner',
      'learners',
      'Admin',
      'quizzes',
      'Studio',
      'Analytics',
    ]);
    const k = terms('gurukul');
    expect([k.Learner, k.learners, k.admin, k.Quizzes, k.studio, k.chapter]).toEqual([
      'Shishya',
      'Shishyas',
      'Kulapati',
      'Parikshas',
      'Vyasa Studio',
      'Parva',
    ]);
  });

  it('picks the article by the first letter', () => {
    expect(article('Admin')).toBe('an Admin');
    expect(article('Kulapati')).toBe('a Kulapati');
    expect(article('educator')).toBe('an educator');
  });

  it('uses the generic names outside a session', () => {
    function Name() {
      return <p>{useTerms().Admin}</p>;
    }
    render(<Name />);
    expect(screen.getByText('Admin')).toBeTruthy();
  });
});

describe('choosing a label set', () => {
  it('asks once, on first sign-in, before any page, and saves the pick', async () => {
    const data = fakeData();
    await openApp('/', { data, labels: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Which names should Gurukul use?' }),
    ).toBeTruthy();
    expect(screen.getByText('Shishya · Acharya · Kulapati · Parva · Pariksha')).toBeTruthy();
    expect(screen.getByText('Learner · Educator · Admin · Chapter · Quiz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Gurukul names/ }));
    expect(data.data.setLabels).toHaveBeenCalledWith('u1', 'gurukul');
  });

  it('says so when the pick is not saved', async () => {
    const data = fakeData();
    data.data.setLabels = () => Promise.reject(new Error('denied'));
    await openApp('/', { data, labels: null });
    fireEvent.click(await screen.findByRole('button', { name: /Plain English/ }));
    expect(await screen.findByText('Could not save your choice. Try again.')).toBeTruthy();
  });

  it('switches from the account menu, both ways', async () => {
    const data = fakeData();
    const { unmount } = await openApp('/', { data, labels: 'gurukul' });
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use plain English names' }));
    expect(data.data.setLabels).toHaveBeenCalledWith('u1', 'generic');
    unmount();
    await openApp('/', { data });
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use Gurukul names' }));
    expect(data.data.setLabels).toHaveBeenLastCalledWith('u1', 'gurukul');
  });
});

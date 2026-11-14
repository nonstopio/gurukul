import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { article, DICTIONARY, terms } from '../src/labels/terms';
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
      'Karyashala',
      'Parva',
    ]);
  });

  it('knows the whole dictionary, grouped, each Gurukul name with its meaning', () => {
    expect(DICTIONARY.map((g) => g.group)).toEqual(['People', 'Learning', 'Places']);
    expect(
      DICTIONARY.flatMap((g) => g.rows).every((r) => r.meaning?.gurukul && r.meaning.generic),
    ).toBe(true);
    const k = terms('gurukul');
    const g = terms('generic');
    expect([
      k.Course,
      k.lessons,
      k.certificate,
      k.Home,
      k.Catalogue,
      k.QuestionBank,
      k.Teams,
    ]).toEqual([
      'Grantha',
      'Adhyayas',
      'Pramanapatra',
      'Ashram',
      'Granthalaya',
      'Prashna Kosha',
      'Kulas',
    ]);
    expect([g.Course, g.lessons, g.home, g.questionBank, g.QuestionBank]).toEqual([
      'Course',
      'lessons',
      'home',
      'question bank',
      'Question bank',
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
      await screen.findByRole('heading', { level: 1, name: 'Which labels should Gurukul use?' }),
    ).toBeTruthy();
    // The dictionary, side by side: each column holds only its own labels and their meanings.
    const gurukul = screen.getByRole('button', { name: 'Select Gurukul labels' });
    const plain = screen.getByRole('button', { name: 'Select Plain English' });
    const inG = within(gurukul);
    expect(inG.getByText('Pramanapatra')).toBeTruthy();
    expect(inG.getByText('Proof of learning')).toBeTruthy();
    expect(inG.queryByText('Certificate')).toBeNull();
    const inP = within(plain);
    expect(inP.getByText('Certificate')).toBeTruthy();
    expect(inP.getByText('Earned when you finish a course')).toBeTruthy();
    expect(inP.queryByText('Pramanapatra')).toBeNull();
    expect(screen.getAllByText('People')).toHaveLength(2);
    fireEvent.click(gurukul);
    expect(data.data.setLabels).toHaveBeenCalledWith('u1', 'gurukul');
    fireEvent.click(plain);
    expect(data.data.setLabels).toHaveBeenLastCalledWith('u1', 'generic');
  });

  it("shows the owl's reaction to a column, and reads the dictionary for screen readers", async () => {
    await openApp('/', { data: fakeData(), labels: null });
    const says = (await screen.findByText(/Before we begin/)).closest('p') as HTMLElement;
    const face = () => document.querySelector('[data-expression]')?.getAttribute('data-expression');
    // A quiet line, not a live region: it changes on every hover and focus.
    expect(says.getAttribute('aria-live')).toBeNull();
    const gurukul = screen.getByRole('button', { name: 'Select Gurukul labels' });
    const plain = screen.getByRole('button', { name: 'Select Plain English' });
    const rows = document.getElementById(gurukul.getAttribute('aria-describedby') as string);
    expect(rows?.textContent).toContain('Pramanapatra, Proof of learning.');
    expect(face()).toBe('happy');
    fireEvent.mouseEnter(gurukul);
    expect(says.textContent).toContain('Gurukul labels');
    expect(face()).toBe('excited');
    fireEvent.mouseLeave(gurukul);
    expect(says.textContent).toContain('Before we begin');
    expect(face()).toBe('happy');
    fireEvent.focus(gurukul);
    expect(face()).toBe('excited');
    fireEvent.blur(gurukul);
    expect(face()).toBe('happy');
    fireEvent.focus(plain);
    expect(says.textContent).toContain('Plain English');
    expect(face()).toBe('happy');
    fireEvent.blur(plain);
    expect(says.textContent).toContain('Before we begin');
  });

  it('says so when the pick is not saved', async () => {
    const data = fakeData();
    data.data.setLabels = () => Promise.reject(new Error('denied'));
    await openApp('/', { data, labels: null });
    fireEvent.click(await screen.findByRole('button', { name: 'Select Plain English' }));
    expect(await screen.findByText('Could not save your choice. Try again.')).toBeTruthy();
  });

  it('switches from the account menu, both ways', async () => {
    const data = fakeData();
    const { unmount } = await openApp('/', { data, labels: 'gurukul' });
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use plain English labels' }));
    expect(data.data.setLabels).toHaveBeenCalledWith('u1', 'generic');
    unmount();
    await openApp('/', { data });
    fireEvent.click(await screen.findByRole('button', { name: /^Account: / }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Use Gurukul labels' }));
    expect(data.data.setLabels).toHaveBeenLastCalledWith('u1', 'gurukul');
  });
});

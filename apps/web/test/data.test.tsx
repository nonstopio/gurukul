import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useConsole } from '../src/console/ConsoleProvider';
import { useLearnerData } from '../src/data/DataProvider';
import { useQuizService } from '../src/quiz/QuizProvider';

describe('useLearnerData', () => {
  it('throws a clear error outside the provider', () => {
    function Probe() {
      useLearnerData();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <DataProvider>/);
    console.error = spy;
  });

  it('useQuizService throws outside its provider', () => {
    function Probe() {
      useQuizService();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <QuizProvider>/);
    console.error = spy;
  });

  it('useConsole throws outside its provider', () => {
    function Probe() {
      useConsole();
      return null;
    }
    const spy = console.error;
    console.error = () => {};
    expect(() => render(<Probe />)).toThrow(/inside <ConsoleProvider>/);
    console.error = spy;
  });
});
